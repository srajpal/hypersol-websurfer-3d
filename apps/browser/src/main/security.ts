import type { WebContents, WebPreferences } from 'electron';

/** Web pages may only be http, https, or the blank page. */
export function isAllowedPageUrl(url: string): boolean {
  if (url === '' || url === 'about:blank') return true;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export interface AttachRecord {
  /** Preload the webview asked for, if any. */
  requestedPreload: string | null;
  /** Preload actually used: always the trusted page preload. */
  appliedPreload: string;
  src: string;
  allowed: boolean;
}

/** Safe settings forced onto every web page, whatever the webview asked for. */
export function lockDownWebPreferences(prefs: WebPreferences, pagePreloadPath: string): string | null {
  const loose = prefs as WebPreferences & { preloadURL?: string };
  const requested = loose.preloadURL ?? loose.preload ?? null;
  delete loose.preloadURL;
  prefs.preload = pagePreloadPath;
  prefs.nodeIntegration = false;
  prefs.nodeIntegrationInSubFrames = false;
  prefs.nodeIntegrationInWorker = false;
  prefs.contextIsolation = true;
  prefs.sandbox = true;
  prefs.webSecurity = true;
  prefs.allowRunningInsecureContent = false;
  prefs.experimentalFeatures = false;
  prefs.spellcheck = false;
  prefs.webviewTag = false;
  return requested === pagePreloadPath ? null : requested;
}

/**
 * Hardens the 3D shell: it never navigates away or opens windows, and
 * every webview it attaches gets the trusted page preload and safe
 * settings. Webviews with a non-web address are refused.
 */
export function hardenShell(
  shell: WebContents,
  pagePreloadPath: string,
  onAttach?: (record: AttachRecord) => void,
): void {
  shell.on('will-attach-webview', (event, webPreferences, params) => {
    const requestedPreload =
      lockDownWebPreferences(webPreferences, pagePreloadPath) ?? (params['preload'] || null);
    const src = params['src'] ?? '';
    const allowed = isAllowedPageUrl(src);
    if (!allowed) event.preventDefault();
    onAttach?.({ requestedPreload, appliedPreload: pagePreloadPath, src, allowed });
  });
  shell.on('will-navigate', (event) => event.preventDefault());
  shell.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/**
 * Hardens a web page's contents: only web addresses, and links that ask
 * for a new window open in the same page for now (tabs arrive in
 * milestone 2).
 */
export function hardenGuest(guest: WebContents): void {
  guest.setWindowOpenHandler(({ url }) => {
    if (isAllowedPageUrl(url) && url !== '') void guest.loadURL(url);
    return { action: 'deny' };
  });
  guest.on('will-navigate', (event, url) => {
    if (!isAllowedPageUrl(url)) event.preventDefault();
  });
}
