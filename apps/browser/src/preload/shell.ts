import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CAPTURE_TAB_CHANNEL, SHELL_COMMAND_CHANNEL, type ShellBridge, type ShellCommand } from '../shared/commands';

/**
 * The narrow bridge the 3D shell sees: read-only facts, commands from the
 * main process (shortcuts, new tabs, favicons), and one request: a
 * snapshot of one of its own tabs.
 */
const bridge: ShellBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions['electron'] ?? '',
    chrome: process.versions['chrome'] ?? '',
  },
  onCommand(listener) {
    const handler = (_event: IpcRendererEvent, command: ShellCommand) => listener(command);
    ipcRenderer.on(SHELL_COMMAND_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(SHELL_COMMAND_CHANNEL, handler);
    };
  },
  captureTab(webContentsId) {
    return ipcRenderer.invoke(CAPTURE_TAB_CHANNEL, webContentsId) as Promise<string | null>;
  },
};

contextBridge.exposeInMainWorld('hypersol', bridge);
