import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, session, webContents } from 'electron';
import { defaultTheme } from '@hypersol/themes';
import { CAPTURE_TAB_CHANNEL, SHELL_COMMAND_CHANNEL, type ShellCommand } from '../shared/commands';
import { wireGuest, wireShortcuts } from './guests';
import { parseLaunchOptions } from './launch-options';
import { hardenShell } from './security';
import { installTestHooks, type TestLog } from './test-hooks';

const options = parseLaunchOptions(process.argv, process.env);

// Development and test runs never use a real profile (AGENTS.md rule 1).
if (options.userDataDir) {
  app.setPath('userData', options.userDataDir);
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getAppPath(), '..', '..', 'userData', 'dev'));
}

const PAGE_PRELOAD = join(__dirname, '../preload/page.js');
const SHELL_PRELOAD = join(__dirname, '../preload/shell.js');

let mainWindow: BrowserWindow | null = null;
let testLog: TestLog | null = null;

/**
 * Windows and Linux: no menu bar; shortcuts are handled per web contents
 * (main/guests.ts) and clipboard keys work natively. macOS needs an app
 * menu with the standard Edit roles for copy and paste to work.
 */
function setAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  );
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'HyperSol WebSurfer 3D',
    backgroundColor: defaultTheme.colors.backgroundBottom,
    autoHideMenuBar: true,
    webPreferences: {
      preload: SHELL_PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
    },
  });
  mainWindow = win;

  const send = (command: ShellCommand) => {
    if (!win.isDestroyed()) win.webContents.send(SHELL_COMMAND_CHANNEL, command);
  };
  hardenShell(win.webContents, PAGE_PRELOAD, (record) => testLog?.attaches.push(record));
  wireShortcuts(win.webContents, { send, platform: process.platform });
  if (!app.isPackaged) {
    // Developer tools for the shell in development runs only.
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  }
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });

  const query: Record<string, string> = {
    startUrl: options.startUrl,
    tilt: String(options.tiltDeg),
    appVersion: app.getVersion(),
  };
  if (options.testMode) query['test'] = '1';
  if (options.searchUrl) query['searchUrl'] = options.searchUrl;

  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServer) {
    void win.loadURL(`${devServer}?${new URLSearchParams(query).toString()}`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    wireGuest(contents, {
      send: (command) => {
        const host = contents.hostWebContents;
        if (host && !host.isDestroyed()) host.send(SHELL_COMMAND_CHANNEL, command);
      },
      platform: process.platform,
      get testLog() {
        return testLog;
      },
    });
  });

  void app.whenReady().then(() => {
    if (options.testMode) testLog = installTestHooks();

    const ses = session.defaultSession;
    // No dictionary downloads (privacy statement, ARCHITECTURE.md section 8).
    ses.setSpellCheckerEnabled(false);
    // No permissions are granted yet (camera, location, notifications, and
    // so on). Permission prompts come in a later milestone.
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

    // Tab snapshots for the cards: only for a web page the asking shell hosts.
    ipcMain.handle(CAPTURE_TAB_CHANNEL, async (event, id: unknown) => {
      if (typeof id !== 'number') return null;
      const guest = webContents.fromId(id);
      if (!guest || guest.isDestroyed() || guest.getType() !== 'webview') return null;
      if (guest.hostWebContents !== event.sender) return null;
      try {
        const image = await guest.capturePage();
        if (image.isEmpty()) return null;
        return `data:image/jpeg;base64,${image.resize({ width: 400, quality: 'good' }).toJPEG(80).toString('base64')}`;
      } catch {
        return null;
      }
    });

    setAppMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
