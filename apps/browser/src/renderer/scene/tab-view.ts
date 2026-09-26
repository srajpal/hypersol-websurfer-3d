import type { PagePanel, PageState, PageStatus } from '@hypersol/scene-core';
import type { WebviewTag } from 'electron';
import { BLOCKED_CARD, CRASHED_CARD, DNS_BLOCKED_CARD, describeLoadError, isLookupFailure, type LoadErrorCard } from '../load-errors';
import { PRIVATE_PARTITION } from '../../shared/commands';
import { LAYERS_CHANNEL, PAGE_IMAGES_CHANNEL, parseImageReport, type LayersState, type PageImage } from '../../shared/layers';
import { StartPanel, type StartData } from './start-panel';

/** Chromium's code for a load that was cancelled by a newer one. */
const ERR_ABORTED = -3;

export interface TabViewEvents {
  onStatus(status: PageStatus): void;
  onNavState(state: { canGoBack: boolean; canGoForward: boolean }): void;
  /** The page finished loading and has painted: a good time for a snapshot. */
  onSettled(): void;
  /** Text submitted in the start panel's search box. */
  onStartSubmit(text: string): void;
  /** A bookmark or history entry chosen on the start panel. */
  onStartOpen(url: string): void;
  /** "Open anyway" on a blocked page: let this address through once in this tab. */
  allowOnce(url: string): Promise<void>;
  /** After a failed lookup: true if encrypted DNS is blocked on this network. */
  isDnsBlocked(): Promise<boolean>;
  /** "Use this network's DNS for now". */
  useNetworkDns(): Promise<void>;
  /** A new document is ready in the page: time to tell it the layers view's state. */
  onPageReady(): void;
  /** Find in page results (milestone 8). */
  onFound?(result: { matches: number; active: number }): void;
}

/**
 * What one tab shows: the start panel until the tab loads an address,
 * then a live Chromium view (an Electron <webview>). The element is
 * created once and never moved in the page: moving a webview reloads it.
 * The room places the element in 3D.
 */
export class TabView implements PagePanel {
  readonly kind = 'live';
  readonly element: HTMLDivElement;
  private webview: WebviewTag | null = null;
  private start: StartPanel | null;
  private readonly shimmer: HTMLDivElement;
  private readonly errorCard: HTMLDivElement;
  private readonly listeners = new Set<(status: PageStatus) => void>();
  private ready = false;
  private pendingUrl: string | null = null;
  private failed = false;
  /** Counts page loads, so a late answer about an earlier failure is ignored. */
  private loadSeq = 0;
  private pageImages: PageImage[] = [];
  private currentStatus: PageStatus;
  private w = 0;
  private h = 0;

  constructor(
    readonly tabId: number,
    url: string,
    private readonly events: TabViewEvents,
    /** A private tab: its page uses the in-memory private session (milestone 8). */
    readonly isPrivate = false,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'hs-panel';
    this.element.dataset['testid'] = 'page-panel';
    this.element.dataset['tabId'] = String(tabId);

    this.shimmer = document.createElement('div');
    this.shimmer.className = 'hs-shimmer';
    this.errorCard = document.createElement('div');
    this.errorCard.className = 'hs-error-card-layer';
    this.errorCard.dataset['testid'] = 'page-overlay';

    if (url === '') {
      this.start = new StartPanel(
        (text) => this.events.onStartSubmit(text),
        (address) => this.events.onStartOpen(address),
      );
      if (isPrivate) {
        const note = document.createElement('p');
        note.className = 'hs-private-note';
        note.dataset['testid'] = 'private-note';
        note.textContent = 'Private tab: no history, cookies, or site data are kept. They go when the last private tab closes.';
        this.start.element.prepend(note);
      }
      this.element.append(this.start.element);
      this.currentStatus = { state: 'loaded', url: '' };
    } else {
      this.start = null;
      this.currentStatus = { state: 'loading', url };
      this.createWebview(url);
    }
    this.element.append(this.shimmer, this.errorCard);
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  get status(): PageStatus {
    return { ...this.currentStatus };
  }

  get isStart(): boolean {
    return this.webview === null;
  }

  /** The <webview>, if the tab shows a page (for the room's pointer tracking). */
  get view(): HTMLElement | null {
    return this.webview;
  }

  /** Available once the page is attached, even if its first load was blocked (no dom-ready yet). */
  get webContentsId(): number | null {
    if (!this.webview) return null;
    try {
      return this.webview.getWebContentsId();
    } catch {
      return null;
    }
  }

  /** The page's images in view, as its preload last reported them (milestone 5). */
  get images(): PageImage[] {
    return this.pageImages.map((i) => ({ ...i }));
  }

  /** The page's zoom factor (1 is 100%). */
  get zoom(): number {
    if (!this.webview || !this.ready) return 1;
    try {
      return this.webview.getZoomFactor();
    } catch {
      return 1;
    }
  }

  setZoom(factor: number): void {
    if (this.webview && this.ready) this.webview.setZoomFactor(factor);
  }

  /**
   * Find in page; an empty text stops finding. `next` moves to the next or
   * previous match of the same search; otherwise a new search starts
   * (Electron's findNext is true for a new search).
   */
  find(text: string, forward: boolean, next: boolean): void {
    if (!this.webview || !this.ready) return;
    if (text === '') {
      this.webview.stopFindInPage('clearSelection');
      this.events.onFound?.({ matches: 0, active: 0 });
      return;
    }
    this.webview.findInPage(text, { forward, findNext: !next });
  }

  stopFind(): void {
    if (this.webview && this.ready) this.webview.stopFindInPage('clearSelection');
  }

  /** Opens the system's print dialog for the page. */
  print(): void {
    if (this.webview && this.ready) void this.webview.print().catch(() => undefined);
  }

  /** Tells the page's preload the layers view's state. */
  sendLayers(state: LayersState): void {
    if (!this.webview || !this.ready) return;
    try {
      this.webview.send(LAYERS_CHANNEL, state);
    } catch {
      // The page is between documents; it asks again when ready.
    }
  }

  /** Bookmarks and recent history for the start panel, if this tab shows it. */
  setStartData(data: StartData): void {
    this.start?.setData(data);
  }

  focusContent(): void {
    if (this.webview) this.webview.focus();
    else this.start?.focus();
  }

  load(url: string): void {
    this.loadSeq += 1;
    this.hideError();
    if (!this.webview) {
      this.start?.element.remove();
      this.start = null;
      this.createWebview(url);
      this.emit({ state: 'loading', url });
      return;
    }
    if (!this.ready) {
      this.pendingUrl = url;
      this.webview.setAttribute('src', url);
      return;
    }
    void this.webview.loadURL(url).catch(() => {
      // Failures are reported through did-fail-load.
    });
  }

  reload(): void {
    if (!this.webview) return;
    this.hideError();
    this.failed = false;
    if (this.ready) this.webview.reload();
  }

  goBack(): void {
    if (this.webview && this.ready && this.webview.canGoBack()) {
      this.hideError();
      this.webview.goBack();
    }
  }

  goForward(): void {
    if (this.webview && this.ready && this.webview.canGoForward()) {
      this.hideError();
      this.webview.goForward();
    }
  }

  setSize(width: number, height: number): void {
    this.w = Math.round(width);
    this.h = Math.round(height);
    this.element.style.width = `${this.w}px`;
    this.element.style.height = `${this.h}px`;
  }

  onStatus(listener: (status: PageStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.element.remove();
  }

  private createWebview(url: string): void {
    const wv = document.createElement('webview') as WebviewTag;
    // Without this Electron drops every new-window request before the main
    // process sees it; main/guests.ts decides and always opens a tab instead.
    wv.setAttribute('allowpopups', '');
    // Set before the first address: a webview's session cannot change afterwards.
    if (this.isPrivate) wv.setAttribute('partition', PRIVATE_PARTITION);
    wv.setAttribute('src', url);
    this.webview = wv;
    this.shimmer.setAttribute('data-visible', '');
    // Before the error and shimmer layers, so they cover the page.
    this.element.prepend(wv);
    this.wireEvents(wv);
  }

  private wireEvents(wv: WebviewTag): void {
    const navState = () => {
      if (!this.ready) return;
      this.events.onNavState({ canGoBack: wv.canGoBack(), canGoForward: wv.canGoForward() });
    };
    wv.addEventListener('dom-ready', () => {
      this.shimmer.removeAttribute('data-visible');
      if (!this.ready) {
        this.ready = true;
        if (this.pendingUrl && this.pendingUrl !== wv.getURL()) {
          const url = this.pendingUrl;
          this.pendingUrl = null;
          this.load(url);
        }
      }
      navState();
      this.events.onPageReady();
    });
    wv.addEventListener('found-in-page', (e) => {
      const r = e.result;
      if (r.finalUpdate !== false) this.events.onFound?.({ matches: r.matches ?? 0, active: r.activeMatchOrdinal ?? 0 });
    });
    wv.addEventListener('ipc-message', (e) => {
      if (e.channel !== PAGE_IMAGES_CHANNEL) return;
      const images = parseImageReport(e.args[0]);
      if (images) this.pageImages = images;
    });
    wv.addEventListener('did-start-loading', () => {
      this.loadSeq += 1;
      this.pageImages = [];
      this.failed = false;
      this.emit({ ...this.currentStatus, state: 'loading', message: undefined });
    });
    wv.addEventListener('did-navigate', (e) => {
      this.emit({ ...this.currentStatus, url: e.url });
      navState();
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (e.isMainFrame) this.emit({ ...this.currentStatus, url: e.url });
      navState();
    });
    wv.addEventListener('page-title-updated', (e) => {
      this.emit({ ...this.currentStatus, title: e.title });
    });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === ERR_ABORTED) return;
      this.failed = true;
      this.shimmer.removeAttribute('data-visible');
      const card = describeLoadError(e.errorCode, e.errorDescription);
      this.showError(card, e.validatedURL);
      this.emit({ state: 'failed', url: e.validatedURL, title: this.currentStatus.title, message: card.title });
      navState();
      if (isLookupFailure(e.errorCode)) void this.checkDns(e.validatedURL);
    });
    wv.addEventListener('did-stop-loading', () => {
      navState();
      if (this.failed || this.currentStatus.state === 'crashed') return;
      this.emit({ ...this.currentStatus, state: 'loaded' });
      this.events.onSettled();
    });
    wv.addEventListener('render-process-gone', () => {
      this.shimmer.removeAttribute('data-visible');
      this.showError(CRASHED_CARD, this.currentStatus.url);
      this.emit({ ...this.currentStatus, state: 'crashed', message: CRASHED_CARD.title });
    });
  }

  /**
   * The privacy shield blocked a page load in this tab. Electron drops a
   * cancelled page load without a failure event, so the main process says
   * so directly; the tab stays on its current page behind the card.
   */
  showBlocked(url: string): void {
    this.failed = true;
    this.shimmer.removeAttribute('data-visible');
    this.showError(BLOCKED_CARD, url);
    this.emit({ state: 'failed', url, title: this.currentStatus.title, message: BLOCKED_CARD.title });
  }

  /** A lookup failed: if encrypted DNS is blocked on this network, say so instead of "not found". */
  private async checkDns(url: string): Promise<void> {
    const seq = this.loadSeq;
    const blocked = await this.events.isDnsBlocked().catch(() => false);
    if (!blocked || seq !== this.loadSeq || !this.failed) return;
    this.showError(DNS_BLOCKED_CARD, url);
    this.emit({ ...this.currentStatus, message: DNS_BLOCKED_CARD.title });
  }

  private showError(card: LoadErrorCard, url: string): void {
    const box = document.createElement('div');
    box.className = 'hs-error-card';
    box.dataset['kind'] = card.kind;
    const title = document.createElement('h2');
    title.textContent = card.title;
    const message = document.createElement('p');
    message.textContent = card.message;
    const address = document.createElement('p');
    address.className = 'hs-error-address';
    address.textContent = url;
    const actions = document.createElement('div');
    actions.className = 'hs-error-actions';
    if (card.canRetry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.id = 'panel-reload';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        if (card.kind === 'crashed' || !this.webview) this.reload();
        else this.load(url);
      });
      actions.append(retry);
    }
    if (card.action) {
      const through = document.createElement('button');
      through.type = 'button';
      through.id = card.action === 'open-anyway' ? 'panel-open-anyway' : 'panel-use-network-dns';
      through.textContent = card.action === 'open-anyway' ? 'Open anyway' : "Use this network's DNS for now";
      through.addEventListener('click', () => {
        const done = card.action === 'open-anyway' ? this.events.allowOnce(url) : this.events.useNetworkDns();
        void done.then(
          () => this.load(url),
          (e: unknown) => console.warn(e instanceof Error ? e.message : String(e)),
        );
      });
      // The way through comes first: it is what the card is for.
      actions.prepend(through);
    }
    const stayedOn = card.kind === 'blocked' && this.webview && this.ready ? this.webview.getURL() : '';
    if (stayedOn && stayedOn !== url) {
      // A blocked page never replaced the one the tab is on: going back
      // means closing the card and showing that page again.
      const back = document.createElement('button');
      back.type = 'button';
      back.id = 'panel-back';
      back.textContent = 'Go back';
      back.addEventListener('click', () => {
        this.hideError();
        this.failed = false;
        this.emit({ ...this.currentStatus, state: 'loaded', url: stayedOn, message: undefined });
      });
      actions.append(back);
    } else if (this.webview && this.ready && this.webview.canGoBack()) {
      const back = document.createElement('button');
      back.type = 'button';
      back.id = 'panel-back';
      back.textContent = 'Go back';
      back.addEventListener('click', () => this.goBack());
      actions.append(back);
    }
    box.append(title, message, address, actions);
    this.errorCard.replaceChildren(box);
    this.errorCard.setAttribute('data-visible', '');
  }

  private hideError(): void {
    this.errorCard.removeAttribute('data-visible');
    this.errorCard.replaceChildren();
  }

  private emit(status: PageStatus): void {
    this.currentStatus = status;
    for (const listener of this.listeners) listener(this.status);
    this.events.onStatus(this.status);
  }
}

export type { PageState };
