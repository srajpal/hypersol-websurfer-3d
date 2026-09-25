import type { PageStatus } from '@hypersol/scene-core';
import type { Theme } from '@hypersol/themes';
import type { ShellBridge, ShellCommand, ShortcutName } from '../shared/commands';
import type { HsAbout } from './hud/about';
import type { HsToolbar, MenuAction } from './hud/toolbar';
import { Room } from './scene/room';
import { TabView } from './scene/tab-view';
import { TabStore, type Tab, type TabState } from './state/tabs';
import { resolveInput } from './url';

export interface AppOptions {
  startUrl: string;
  tiltDeg: number;
  searchUrl: string;
  theme: Theme;
  bridge: ShellBridge;
  roomElement: HTMLElement;
  toolbar: HsToolbar;
  about: HsAbout;
  tabList: HTMLElement;
}

const SNAPSHOT_DELAY_MS = 400;

/**
 * The shell's controller: keeps the tab list, the pages, the room, and
 * the top bar in step, and acts on commands from the main process.
 */
export class App {
  readonly store = new TabStore();
  readonly room: Room;
  private readonly views = new Map<number, TabView>();
  private shownFocus = -1;
  private readonly snapshotTimers = new Map<number, number>();

  constructor(private readonly options: AppOptions) {
    this.room = new Room(options.roomElement, options.theme, {
      tiltDeg: options.tiltDeg,
      callbacks: {
        onCardClick: (key) => (key === 'plus' ? this.store.open() : this.store.focus(key)),
        onCardClose: (key) => this.store.close(key),
      },
    });
    this.store.subscribe(() => this.sync());
    this.wireToolbar();
    options.bridge.onCommand((command) => this.onCommand(command));
    this.store.open(options.startUrl === '' ? {} : { url: options.startUrl });
  }

  get focusedView(): TabView | undefined {
    return this.views.get(this.store.focusedId);
  }

  viewOf(tabId: number): TabView | undefined {
    return this.views.get(tabId);
  }

  /** Loads typed text in a tab: an address, or a search. */
  navigate(tabId: number, text: string): void {
    const result = resolveInput(text, this.options.searchUrl);
    const view = this.views.get(tabId);
    if (!result || !view) return;
    this.store.update(tabId, { url: result.url, state: 'loading', title: result.url });
    view.load(result.url);
    if (tabId === this.store.focusedId) view.focusContent();
  }

  private sync(): void {
    const { store } = this;
    // New tabs get a view; closed tabs lose theirs.
    for (const tab of store.tabs) {
      if (!this.views.has(tab.id)) this.createView(tab);
    }
    const open = new Set(store.tabs.map((t) => t.id));
    for (const id of [...this.views.keys()]) {
      if (!open.has(id)) {
        this.room.removeView(id);
        this.views.delete(id);
        window.clearTimeout(this.snapshotTimers.get(id));
        this.snapshotTimers.delete(id);
      }
    }

    this.room.setCards(
      store.tabs.map((t) => ({
        key: t.id,
        title: t.title,
        loading: t.state === 'loading',
        ...(t.favicon ? { favicon: t.favicon } : {}),
        focused: t.id === store.focusedId,
      })),
    );

    this.updateToolbar();
    if (store.focusedId !== this.shownFocus) {
      const previous = this.shownFocus;
      if (this.views.has(previous)) this.captureSnapshot(previous);
      this.shownFocus = store.focusedId;
      this.room.focus(store.focusedId, previous !== -1);
      const view = this.focusedView;
      if (view?.isStart) this.options.toolbar.focusAddress();
      else view?.focusContent();
    }
    this.renderTabList();
  }

  private createView(tab: Tab): void {
    const id = tab.id;
    const view = new TabView(id, tab.url, {
      onStatus: (status) => this.onStatus(id, status),
      onNavState: (nav) => this.store.update(id, nav),
      onSettled: () => this.scheduleSnapshot(id),
      onStartSubmit: (text) => this.navigate(id, text),
    });
    this.views.set(id, view);
    this.room.addView(view);
  }

  private onStatus(tabId: number, status: PageStatus): void {
    const tab = this.store.get(tabId);
    const view = this.views.get(tabId);
    if (!tab || !view) return;
    const state: TabState = view.isStart ? 'start' : status.state;
    this.store.update(tabId, {
      state,
      ...(status.url ? { url: status.url } : {}),
      ...(status.title ? { title: status.title } : status.url && tab.title === tab.url ? { title: status.url } : {}),
    });
  }

  private scheduleSnapshot(tabId: number): void {
    window.clearTimeout(this.snapshotTimers.get(tabId));
    this.snapshotTimers.set(
      tabId,
      window.setTimeout(() => this.captureSnapshot(tabId), SNAPSHOT_DELAY_MS),
    );
  }

  private captureSnapshot(tabId: number): void {
    const id = this.views.get(tabId)?.webContentsId;
    if (id === null || id === undefined) return;
    void this.options.bridge.captureTab(id).then((dataUrl) => {
      if (dataUrl && this.views.has(tabId)) this.room.setSnapshot(tabId, dataUrl);
    });
  }

  private updateToolbar(): void {
    const tab = this.store.focusedTab;
    const t = this.options.toolbar;
    if (!tab) return;
    t.url = tab.state === 'start' ? '' : tab.url;
    t.canGoBack = tab.canGoBack;
    t.canGoForward = tab.canGoForward;
    t.canReload = tab.state !== 'start';
    t.loading = tab.state === 'loading';
  }

  private wireToolbar(): void {
    const t = this.options.toolbar;
    t.addEventListener('hs-navigate', (e) => this.navigate(this.store.focusedId, (e as CustomEvent<string>).detail));
    t.addEventListener('hs-back', () => this.focusedView?.goBack());
    t.addEventListener('hs-forward', () => this.focusedView?.goForward());
    t.addEventListener('hs-reload', () => this.focusedView?.reload());
    t.addEventListener('hs-menu', (e) => this.onMenu((e as CustomEvent<MenuAction>).detail));
  }

  private onMenu(action: MenuAction): void {
    if (action === 'new-tab') this.store.open();
    else if (action === 'close-tab') this.store.close(this.store.focusedId);
    else if (action === 'about') this.options.about.open = true;
  }

  private onCommand(command: ShellCommand): void {
    switch (command.type) {
      case 'shortcut':
        this.onShortcut(command.name);
        break;
      case 'open-tab': {
        const opener = this.tabForWebContents(command.openerWebContentsId);
        this.store.open({
          url: command.url,
          background: command.background,
          ...(opener !== undefined ? { afterId: opener } : {}),
        });
        break;
      }
      case 'favicon': {
        const tabId = this.tabForWebContents(command.webContentsId);
        if (tabId !== undefined) this.store.update(tabId, { favicon: command.dataUrl });
        break;
      }
    }
  }

  private onShortcut(name: ShortcutName): void {
    const s = this.store;
    switch (name) {
      case 'new-tab':
        s.open();
        break;
      case 'close-tab':
        s.close(s.focusedId);
        break;
      case 'focus-address':
        this.options.toolbar.focusAddress();
        break;
      case 'next-tab':
        s.cycle(1);
        break;
      case 'prev-tab':
        s.cycle(-1);
        break;
      case 'reload':
        this.focusedView?.reload();
        break;
      case 'back':
        this.focusedView?.goBack();
        break;
      case 'forward':
        this.focusedView?.goForward();
        break;
    }
  }

  private tabForWebContents(webContentsId: number | undefined): number | undefined {
    if (webContentsId === undefined) return undefined;
    for (const [tabId, view] of this.views) {
      if (view.webContentsId === webContentsId) return tabId;
    }
    return undefined;
  }

  /**
   * An off-screen list of tabs for keyboard and screen-reader users,
   * mirroring the 3D cards.
   */
  private renderTabList(): void {
    const list = this.options.tabList;
    const buttons = this.store.tabs.map((tab) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', tab.id === this.store.focusedId ? 'true' : 'false');
      b.textContent = tab.title || 'Untitled';
      b.addEventListener('click', () => this.store.focus(tab.id));
      return b;
    });
    list.replaceChildren(...buttons);
  }
}
