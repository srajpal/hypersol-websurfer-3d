import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import { defaultTheme } from '@hypersol/themes';
import { parseLaunchOptions } from './launch-options';
import { hardenGuest, hardenShell } from './security';
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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
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

  hardenShell(win.webContents, PAGE_PRELOAD, (record) => testLog?.attaches.push(record));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });

  const query: Record<string, string> = {
    startUrl: options.startUrl,
    tilt: String(options.tiltDeg),
  };
  if (options.testMode) query['test'] = '1';

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
    if (contents.getType() === 'webview') hardenGuest(contents);
  });

  void app.whenReady().then(() => {
    if (options.testMode) testLog = installTestHooks();

    const ses = session.defaultSession;
    // No dictionary downloads (privacy statement, ARCHITECTURE.md section 8).
    ses.setSpellCheckerEnabled(false);
    // Milestone 1 grants no permissions (camera, location, notifications,
    // and so on). Permission prompts come in a later milestone.
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
