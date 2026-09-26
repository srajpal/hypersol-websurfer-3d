/**
 * Messages from the main process to the 3D shell. The main process sees
 * keyboard shortcuts, new-window requests, and favicons for every web
 * page; the shell owns the tabs and acts on these.
 */

export const SHELL_COMMAND_CHANNEL = 'hypersol:command';
/** Shell asks the main process for a snapshot of one of its tabs. */
export const CAPTURE_TAB_CHANNEL = 'hypersol:capture-tab';
/** Shell tells the main process it has saved what it must before the window closes. */
export const CLOSE_READY_CHANNEL = 'hypersol:close-ready';

import type { DataOp, DataReply, DataRequest } from './data';
import type { PrivacyOp, PrivacyReply, PrivacyRequest } from './privacy';

export type ShortcutName =
  | 'layers'
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
  | { type: 'data-changed'; what: 'bookmarks' | 'history' | 'settings' }
  /** How many requests the privacy shield has blocked on a tab's page. */
  | { type: 'shield'; webContentsId: number; count: number }
  /** The shield blocked a whole page in a tab (the tab shows the blocked card). */
  | { type: 'page-blocked'; webContentsId: number; url: string }
  /** The filter lists changed (refreshed, or a refresh started or failed). */
  | { type: 'filters-changed' }
  /** The window is closing: save the open tabs now, then call closeReady(). */
  | { type: 'prepare-close' };

/** What the shell's preload exposes as window.hypersol. */
export interface ShellBridge {
  platform: string;
  versions: { electron: string; chrome: string };
  onCommand(listener: (command: ShellCommand) => void): () => void;
  /** A JPEG data: URL of a tab's page, or null if it cannot be captured. */
  captureTab(webContentsId: number): Promise<string | null>;
  /** Saved data: bookmarks, history, settings, session (shared/data.ts). */
  data<K extends DataOp>(request: Extract<DataRequest, { op: K }>): Promise<DataReply<K>>;
  /** Privacy shield, filter lists, and encrypted DNS (shared/privacy.ts). */
  privacy<K extends PrivacyOp>(request: Extract<PrivacyRequest, { op: K }>): Promise<PrivacyReply<K>>;
  /** Answer to prepare-close: saving is done (or has failed), the window may close. */
  closeReady(): void;
}
