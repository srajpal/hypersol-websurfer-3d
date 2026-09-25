import type { PagePanel, PageState, PageStatus } from '@hypersol/scene-core';
import type { WebviewTag } from 'electron';
import { CRASHED_CARD, describeLoadError, type LoadErrorCard } from '../load-errors';
import { StartPanel } from './start-panel';

/** Chromium's code for a load that was cancelled by a newer one. */
const ERR_ABORTED = -3;

export interface TabViewEvents {
  onStatus(status: PageStatus): void;
  onNavState(state: { canGoBack: boolean; canGoForward: boolean }): void;
  /** The page finished loading and has painted: a good time for a snapshot. */
  onSettled(): void;
  /** Text submitted in the start panel's search box. */
  onStartSubmit(text: string): void;
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
  private currentStatus: PageStatus;
  private w = 0;
  private h = 0;

  constructor(
    readonly tabId: number,
    url: string,
    private readonly events: TabViewEvents,
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
      this.start = new StartPanel((text) => this.events.onStartSubmit(text));
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

  get webContentsId(): number | null {
    if (!this.webview || !this.ready) return null;
    try {
      return this.webview.getWebContentsId();
    } catch {
      return null;
    }
  }

  focusContent(): void {
    if (this.webview) this.webview.focus();
    else this.start?.focus();
  }

  load(url: string): void {
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
    });
    wv.addEventListener('did-start-loading', () => {
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
    if (this.webview && this.ready && this.webview.canGoBack()) {
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
