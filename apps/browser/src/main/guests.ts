import { clipboard, Menu, nativeImage, type MenuItemConstructorOptions, type WebContents } from 'electron';
import type { ShellCommand } from '../shared/commands';
import { contextMenuEntries, type MenuAction } from './context-menu';
import { decidePopup, GESTURE_EVENTS } from './popups';
import { isAllowedPageUrl } from './security';
import { matchShortcut } from './shortcuts';
import type { TestLog } from './test-hooks';

export interface GuestDeps {
  /** Sends a command to the shell that hosts this page. */
  send(command: ShellCommand): void;
  platform: string;
  testLog: TestLog | null;
}

/**
 * Sends browser shortcuts pressed in this web contents (the shell or a
 * page) to the shell, and stops the page from also seeing them.
 */
export function wireShortcuts(contents: WebContents, deps: Pick<GuestDeps, 'send' | 'platform'>): void {
  contents.on('before-input-event', (event, input) => {
    const name = matchShortcut(input, deps.platform);
    if (!name) return;
    event.preventDefault();
    deps.send({ type: 'shortcut', name });
  });
}

/**
 * Everything the main process does for one web page: web addresses only,
 * shortcuts, new-window rules, the right-click menu, and favicons.
 */
export function wireGuest(guest: WebContents, deps: GuestDeps): void {
  let lastGesture: number | null = null;

  guest.on('input-event', (_event, input) => {
    if (GESTURE_EVENTS.has(input.type)) lastGesture = Date.now();
  });
  // A new document starts without the person's click.
  guest.on('did-navigate', () => {
    lastGesture = null;
  });

  guest.on('will-navigate', (event, url) => {
    if (!isAllowedPageUrl(url)) event.preventDefault();
  });

  guest.setWindowOpenHandler(({ url, disposition }) => {
    if (url === '' || !isAllowedPageUrl(url)) return { action: 'deny' };
    const decision = decidePopup(disposition, lastGesture === null ? null : Date.now() - lastGesture);
    if (decision.allow) {
      deps.send({ type: 'open-tab', url, background: decision.background, openerWebContentsId: guest.id });
    } else {
      deps.testLog?.blockedPopups.push(url);
    }
    return { action: 'deny' };
  });

  wireShortcuts(guest, deps);

  guest.on('context-menu', (_event, params) => {
    const history = guest.navigationHistory;
    const entries = contextMenuEntries(params, {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    });
    const run = (action: MenuAction) => runMenuAction(guest, action, params.linkURL, deps);
    const template: MenuItemConstructorOptions[] = entries.map((e) =>
      'separator' in e
        ? { type: 'separator' }
        : { id: e.action, label: e.label, enabled: e.enabled, click: () => run(e.action) },
    );
    if (deps.testLog) {
      // Tests read the menu and pick an entry instead of a native popup,
      // which would wait for a real mouse.
      deps.testLog.menus.push({
        labels: entries.map((e) => ('separator' in e ? '---' : e.label)),
        run: (label: string) => {
          const entry = entries.find((e) => !('separator' in e) && e.label === label);
          if (!entry || 'separator' in entry || !entry.enabled) throw new Error(`No enabled entry "${label}"`);
          run(entry.action);
        },
      });
      return;
    }
    Menu.buildFromTemplate(template).popup();
  });

  guest.on('page-favicon-updated', (_event, favicons) => {
    void loadFavicon(guest, favicons).then((dataUrl) => {
      if (dataUrl) deps.send({ type: 'favicon', webContentsId: guest.id, dataUrl });
    });
  });
}

function runMenuAction(guest: WebContents, action: MenuAction, linkURL: string, deps: GuestDeps): void {
  switch (action) {
    case 'open-link-new-tab':
      deps.send({ type: 'open-tab', url: linkURL, background: true, openerWebContentsId: guest.id });
      break;
    case 'copy-link':
      clipboard.writeText(linkURL);
      break;
    case 'cut':
      guest.cut();
      break;
    case 'copy':
      guest.copy();
      break;
    case 'paste':
      guest.paste();
      break;
    case 'select-all':
      guest.selectAll();
      break;
    case 'back':
      guest.navigationHistory.goBack();
      break;
    case 'forward':
      guest.navigationHistory.goForward();
      break;
    case 'reload':
      guest.reload();
      break;
  }
}

/**
 * Fetches a page's favicon through the page's own session (the same
 * request a browser tab makes) and returns it as a small data: URL.
 */
async function loadFavicon(guest: WebContents, urls: string[]): Promise<string | null> {
  for (const url of urls.slice(0, 3)) {
    try {
      let image;
      if (url.startsWith('data:image/')) {
        image = nativeImage.createFromDataURL(url);
      } else if (/^https?:\/\//i.test(url)) {
        const response = await guest.session.fetch(url);
        if (!response.ok) continue;
        image = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()));
      } else {
        continue;
      }
      if (image.isEmpty()) continue;
      return image.resize({ width: 32, height: 32, quality: 'best' }).toDataURL();
    } catch {
      // Try the next one.
    }
  }
  return null;
}
