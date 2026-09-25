/**
 * Messages from the main process to the 3D shell. The main process sees
 * keyboard shortcuts, new-window requests, and favicons for every web
 * page; the shell owns the tabs and acts on these.
 */

export const SHELL_COMMAND_CHANNEL = 'hypersol:command';
/** Shell asks the main process for a snapshot of one of its tabs. */
export const CAPTURE_TAB_CHANNEL = 'hypersol:capture-tab';

import type { DataOp, DataReply, DataRequest } from './data';

export type ShortcutName =
  | 'bookmark'
  | 'library'
  | 'settings'
  | 'new-tab'
  | 'close-tab'
  | 'focus-address'
  | 'next-tab'
  | 'prev-tab'
  | 'reload'
  | 'back'
  | 'forward';

export type ShellCommand =
  | { type: 'shortcut'; name: ShortcutName }
  | { type: 'open-tab'; url: string; background: boolean; openerWebContentsId?: number }
  | { type: 'favicon'; webContentsId: number; dataUrl: string }
  | { type: 'data-changed'; what: 'bookmarks' | 'history' | 'settings' };

/** What the shell's preload exposes as window.hypersol. */
export interface ShellBridge {
  platform: string;
  versions: { electron: string; chrome: string };
  onCommand(listener: (command: ShellCommand) => void): () => void;
  /** A JPEG data: URL of a tab's page, or null if it cannot be captured. */
  captureTab(webContentsId: number): Promise<string | null>;
  /** Saved data: bookmarks, history, settings, session (shared/data.ts). */
  data<K extends DataOp>(request: Extract<DataRequest, { op: K }>): Promise<DataReply<K>>;
}
