import type { PageStatus } from '@hypersol/scene-core';
import type { Theme } from '@hypersol/themes';
import type { ShellBridge, ShellCommand, ShortcutName } from '../shared/commands';
import { DEFAULT_SETTINGS, searchUrlFor, type Settings } from '../shared/settings';
import { DataClient } from './data';
import type { HsAbout } from './hud/about';
import type { HsLibrary } from './hud/library';
import type { HsSettings } from './hud/settings';
import type { HsToolbar, MenuAction } from './hud/toolbar';
import { Room } from './scene/room';
import type { StartData } from './scene/start-panel';
import { TabView } from './scene/tab-view';
import { TabStore, type Tab, type TabState } from './state/tabs';
import { resolveInput } from './url';

export interface AppOptions {
  startUrl: string;
  tiltDeg: number;
  /** Test runs only: replaces DuckDuckGo's address with a local stand-in. */
  searchUrlOverride?: string;
  theme: Theme;
  bridge: ShellBridge;
  roomElement: HTMLElement;
  toolbar: HsToolbar;
  about: HsAbout;
  library: HsLibrary;
  settingsPanel: HsSettings;
  tabList: HTMLElement;
}

type PanelName = 'library' | 'settings';

const SNAPSHOT_DELAY_MS = 400;
const SESSION_SAVE_DELAY_MS = 400;
const isWeb = (url: string) => /^https?:\/\//i.test(url);

/**
 * The shell's controller: keeps the tab list, the pages, the room, the
 * top bar, and the panels in step, and acts on commands from the main
 * process.
 */
export class App {
  readonly store = new TabStore();
  readonly room: Room;
  readonly data: DataClient;
  /** True once saved settings and tabs have been loaded. */
  ready = false;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private readonly views = new Map<number, TabView>();
  private shownFocus = -1;
  private readonly snapshotTimers = new Map<number, number>();
  private sessionTimer: number | undefined;
  private starUrl = '';
  private openPanelName: PanelName | null = null;
  private focusBeforePanel: Element | null = null;

  constructor(private readonly options: AppOptions) {
    this.data = new DataClient(options.bridge);
    options.library.client = this.data;
    options.settingsPanel.client = this.data;
    this.room = new Room(options.roomElement, options.theme, {
      tiltDeg: options.tiltDeg,
      callbacks: {
        onCardClick: (key) => (key === 'plus' ? this.store.open() : this.store.focus(key)),
        onCardClose: (key) => this.store.close(key),
      },
    });
    this.store.subscribe(() => this.sync());
    this.wireToolbar();
    this.wirePanels();
    options.bridge.onCommand((command) => this.onCommand(command));
  }

  /** Loads settings, then opens the first tabs: the saved ones if asked, else a start tab. */
  async start(): Promise<void> {
    this.settings = await this.data.get({ op: 'settings.get' }).catch(() => ({ ...DEFAULT_SETTINGS }));
    const saved = this.options.startUrl === '' ? await this.data.get({ op: 'startup' }).catch(() => null) : null;
    if (saved) {
      saved.tabs.forEach((url, i) => this.store.open({ url, background: i !== saved.focused }));
      const focused = this.store.tabs[saved.focused];
      if (focused) this.store.focus(focused.id);
    } else {
      this.store.open(this.options.startUrl === '' ? {} : { url: this.options.startUrl });
    }
    this.ready = true;
    void this.refreshStartData();
  }

  get focusedView(): TabView | undefined {
    return this.views.get(this.store.focusedId);
  }

  get openPanel(): PanelName | null {
    return this.openPanelName;
  }

  viewOf(tabId: number): TabView | undefined {
    return this.views.get(tabId);
  }

  get searchUrl(): string {
    const override = this.options.searchUrlOverride;
    if (override && this.settings.searchEngine === DEFAULT_SETTINGS.searchEngine) return override;
    return searchUrlFor(this.settings);
  }

  /** Loads typed text in a tab: an address, or a search. */
  navigate(tabId: number, text: string): void {
    const result = resolveInput(text, this.searchUrl);
    const view = this.views.get(tabId);
    if (!result || !view) return;
    this.store.update(tabId, { url: result.url, state: 'loading', title: result.url });
    view.load(result.url);
    if (tabId === this.store.focusedId) view.focusContent();
  }

  // ---- Tabs ---------------------------------------------------------------

  private sync(): void {
    const { store } = this;
    let newStart = false;
    for (const tab of store.tabs) {
      if (!this.views.has(tab.id)) {
        this.createView(tab);
        if (tab.url === '') newStart = true;
      }
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
      if (!this.openPanelName) {
        const view = this.focusedView;
        if (view?.isStart) this.options.toolbar.focusAddress();
        else view?.focusContent();
      }
    }
    this.renderTabList();
    void this.updateStar();
    if (newStart && this.ready) void this.refreshStartData();
    this.scheduleSessionSave();
  }

  private createView(tab: Tab): void {
    const id = tab.id;
    const view = new TabView(id, tab.url, {
      onStatus: (status) => this.onStatus(id, status),
      onNavState: (nav) => this.store.update(id, nav),
      onSettled: () => this.scheduleSnapshot(id),
      onStartSubmit: (text) => this.navigate(id, text),
      onStartOpen: (url) => this.navigate(id, url),
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

  /** Saves the open web tabs, for "reopen your tabs from last time". */
  private scheduleSessionSave(): void {
    if (!this.ready) return;
    window.clearTimeout(this.sessionTimer);
    this.sessionTimer = window.setTimeout(() => {
      const web = this.store.tabs.filter((t) => isWeb(t.url));
      const focused = web.findIndex((t) => t.id === this.store.focusedId);
      void this.data.get({ op: 'session.save', tabs: web.map((t) => t.url), focused }).catch(() => undefined);
    }, SESSION_SAVE_DELAY_MS);
  }

  // ---- Saved data ---------------------------------------------------------

  /** Refreshes every start panel with bookmarks and recent history. */
  private async refreshStartData(): Promise<void> {
    const starts = [...this.views.values()].filter((v) => v.isStart);
    if (starts.length === 0) return;
    let data: StartData;
    try {
      const status = await this.data.get({ op: 'status' });
      if (!status.available) throw new Error(status.message ?? "Couldn't open your saved data");
      const [bookmarks, recent] = await Promise.all([
        this.data.get({ op: 'bookmarks.list' }),
        this.data.get({ op: 'history.recent', limit: 8 }),
      ]);
      data = { bookmarks, recent };
    } catch (e) {
      data = { bookmarks: [], recent: [], unavailable: e instanceof Error ? e.message : String(e) };
    }
    for (const view of this.views.values()) view.setStartData(data);
  }

  /** Shows whether the focused page is bookmarked. */
  private async updateStar(): Promise<void> {
    const tab = this.store.focusedTab;
    const t = this.options.toolbar;
    const url = tab && isWeb(tab.url) && tab.state !== 'failed' ? tab.url : '';
    this.starUrl = url;
    if (!url) {
      t.canBookmark = false;
      t.bookmarked = false;
      return;
    }
    try {
      const [status, has] = await Promise.all([
        this.data.get({ op: 'status' }),
        this.data.get({ op: 'bookmarks.has', url }),
      ]);
      if (this.starUrl !== url) return;
      t.canBookmark = status.available;
      t.bookmarked = has;
    } catch {
      if (this.starUrl === url) t.canBookmark = false;
    }
  }

  private async toggleBookmark(): Promise<void> {
    const tab = this.store.focusedTab;
    if (!tab || !isWeb(tab.url) || !this.options.toolbar.canBookmark) return;
    try {
      if (await this.data.get({ op: 'bookmarks.has', url: tab.url })) {
        await this.data.get({ op: 'bookmarks.remove', url: tab.url });
      } else {
        await this.data.get({ op: 'bookmarks.add', url: tab.url, title: tab.title, favicon: tab.favicon ?? null });
      }
    } catch {
      // The star shows the real state after the refresh below.
    }
    await this.updateStar();
  }

  // ---- Panels -------------------------------------------------------------

  private togglePanel(name: PanelName): void {
    if (this.openPanelName === name) {
      this.panel(name).close();
      return;
    }
    if (this.openPanelName) {
      const other = this.openPanelName;
      this.openPanelName = null; // switching panels: keep the focus to return to
      this.panel(other).open = false;
    } else {
      this.focusBeforePanel = document.activeElement;
    }
    this.openPanelName = name;
    if (name === 'library') this.options.library.show();
    else this.options.settingsPanel.show();
  }

  private panel(name: PanelName): HsLibrary | HsSettings {
    return name === 'library' ? this.options.library : this.options.settingsPanel;
  }

  /** Focus goes back where it was before the panel opened. */
  private onPanelClosed(): void {
    this.openPanelName = null;
    const before = this.focusBeforePanel;
    this.focusBeforePanel = null;
    if (before === this.options.toolbar) this.options.toolbar.focusAddress();
    else if (before instanceof HTMLElement && before.isConnected && before !== document.body) before.focus();
    else this.focusedView?.focusContent();
  }

  private wirePanels(): void {
    const { library, settingsPanel } = this.options;
    for (const panel of [library, settingsPanel]) {
      panel.addEventListener('hs-panel-closed', () => this.onPanelClosed());
    }
    library.addEventListener('hs-open-url', (e) => {
      const url = (e as CustomEvent<string>).detail;
      library.close();
      this.navigate(this.store.focusedId, url);
    });
    settingsPanel.addEventListener('hs-settings-changed', (e) => {
      this.settings = (e as CustomEvent<Settings>).detail;
    });
    // Escape closes an open panel even when the focus is elsewhere in the shell.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openPanelName) this.panel(this.openPanelName).close();
    });
  }

  // ---- Top bar and commands ----------------------------------------------

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
    t.addEventListener('hs-bookmark', () => void this.toggleBookmark());
    t.addEventListener('hs-menu', (e) => this.onMenu((e as CustomEvent<MenuAction>).detail));
  }

  private onMenu(action: MenuAction): void {
    if (action === 'new-tab') this.store.open();
    else if (action === 'close-tab') this.store.close(this.store.focusedId);
    else if (action === 'library' || action === 'settings') this.togglePanel(action);
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
      case 'data-changed':
        if (command.what === 'settings') {
          void this.data.get({ op: 'settings.get' }).then((s) => (this.settings = s)).catch(() => undefined);
          break;
        }
        void this.refreshStartData();
        void this.updateStar();
        if (this.openPanelName === 'library') void this.options.library.refresh();
        break;
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
      case 'bookmark':
        void this.toggleBookmark();
        break;
      case 'library':
      case 'settings':
        this.togglePanel(name);
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
