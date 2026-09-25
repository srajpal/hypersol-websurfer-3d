import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, screen, session, webContents } from 'electron';
import { defaultTheme } from '@hypersol/themes';
import { CAPTURE_TAB_CHANNEL, CLOSE_READY_CHANNEL, SHELL_COMMAND_CHANNEL, type ShellCommand } from '../shared/commands';
import { DATA_CHANNEL } from '../shared/data';
import { wireGuest, wireShortcuts } from './guests';
import { parseLaunchOptions } from './launch-options';
import { hardenShell } from './security';
import { StorageService } from './storage/service';
import { installTestHooks, type TestLog } from './test-hooks';

const options = parseLaunchOptions(process.argv, process.env);

// Development and test runs never use a real profile (AGENTS.md rule 1).
if (options.userDataDir) {
  app.setPath('userData', options.userDataDir);
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getAppPath(), '..', '..', 'userData', 'dev'));
}

if (options.testBackground) {
  // Test windows sit off screen, behind everything. Chromium normally stops
  // drawing windows nobody can see; these switches keep it drawing, so the
  // checks see the same frames as a visible window.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

const PAGE_PRELOAD = join(__dirname, '../preload/page.js');
const SHELL_PRELOAD = join(__dirname, '../preload/shell.js');

let mainWindow: BrowserWindow | null = null;
let testLog: TestLog | null = null;
let storage: StorageService | null = null;

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

/** A spot to the right of every display, for background test windows. */
function offScreenPosition(): { x: number; y: number } {
  const right = Math.max(...screen.getAllDisplays().map((d) => d.bounds.x + d.bounds.width));
  return { x: right + 200, y: 0 };
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(options.testBackground ? { ...offScreenPosition(), skipTaskbar: true } : {}),
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
  // Background test windows appear without taking focus.
  win.once('ready-to-show', () => (options.testBackground ? win.showInactive() : win.show()));
  win.on('closed', () => {
    mainWindow = null;
  });
  flushBeforeClose(win);

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

/** How long a closing window waits for the shell to save the open tabs. */
const CLOSE_FLUSH_MS = 2000;

/**
 * Before the window closes, the shell saves the open tabs at once (its
 * usual save waits for changes to settle) and confirms; the window then
 * closes. If the shell does not answer within CLOSE_FLUSH_MS, or has
 * crashed, it closes anyway (GitHub issue #3).
 */
function flushBeforeClose(win: BrowserWindow): void {
  let ready = false;
  let waiting = false;
  win.on('close', (event) => {
    if (ready || win.webContents.isCrashed() || win.webContents.isDestroyed()) return;
    event.preventDefault();
    if (waiting) return;
    waiting = true;
    const finish = () => {
      ipcMain.removeListener(CLOSE_READY_CHANNEL, onReady);
      clearTimeout(timer);
      ready = true;
      if (!win.isDestroyed()) win.close();
    };
    const onReady = (e: Electron.IpcMainEvent) => {
      if (e.sender === win.webContents) finish();
    };
    const timer = setTimeout(finish, CLOSE_FLUSH_MS);
    ipcMain.on(CLOSE_READY_CHANNEL, onReady);
    win.webContents.send(SHELL_COMMAND_CHANNEL, { type: 'prepare-close' } satisfies ShellCommand);
  });
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
      recordVisit: (url, title) => storage?.recordVisit(url, title) ?? null,
      updateVisitTitle: (id, title) => storage?.updateVisitTitle(id, title),
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

    // Saved data lives in the app data folder (a throwaway one in dev and tests).
    storage = new StorageService(app.getPath('userData'), {
      clearCookiesAndSiteData: () =>
        ses.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem'],
        }),
      clearCache: () => ses.clearCache(),
    });
    if (storage.problem) console.warn(`Saved data unavailable: ${storage.problem}`);
    ipcMain.handle(DATA_CHANNEL, (event, request: unknown) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) {
        return { ok: false, error: 'Not allowed' };
      }
      if (testLog && typeof request === 'object' && request !== null) {
        const op = String((request as { op?: unknown }).op);
        testLog.dataOps[op] = (testLog.dataOps[op] ?? 0) + 1;
      }
      return storage!.handle(request);
    });
    storage.onChange((what) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(SHELL_COMMAND_CHANNEL, { type: 'data-changed', what } satisfies ShellCommand);
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

  app.on('will-quit', () => storage?.close());
}
