import type { PagePanel, PageStatus } from '@hypersol/scene-core';
import type { WebviewTag } from 'electron';

/** Chromium's code for a load that was cancelled by a newer one. */
const ERR_ABORTED = -3;

/**
 * The focused page as a live Chromium view: an Electron <webview> inside
 * a plain element that the room places in 3D with CSS transforms.
 * Waiting and error states are plain text in milestone 1; styled cards
 * arrive in milestone 2.
 */
export class LivePanel implements PagePanel {
  readonly kind = 'live';
  /** The element the room positions in 3D. */
  readonly element: HTMLDivElement;
  private readonly webview: WebviewTag;
  private readonly overlay: HTMLDivElement;
  private readonly overlayTitle: HTMLParagraphElement;
  private readonly overlayDetail: HTMLParagraphElement;
  private readonly listeners = new Set<(status: PageStatus) => void>();
  private ready = false;
  private pendingUrl: string | null = null;
  private failed = false;
  private currentStatus: PageStatus;
  private w = 0;
  private h = 0;

  constructor(startUrl: string) {
    this.currentStatus = { state: 'loading', url: startUrl };

    this.element = document.createElement('div');
    this.element.className = 'hs-panel';
    this.element.dataset['testid'] = 'page-panel';

    this.webview = document.createElement('webview') as WebviewTag;
    this.webview.setAttribute('src', startUrl);
    this.element.append(this.webview);

    this.overlay = document.createElement('div');
    this.overlay.className = 'hs-panel-overlay';
    this.overlay.dataset['testid'] = 'page-overlay';
    this.overlayTitle = document.createElement('p');
    this.overlayTitle.style.margin = '0';
    this.overlayDetail = document.createElement('p');
    this.overlayDetail.className = 'hs-overlay-detail';
    this.overlayDetail.style.margin = '0';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.id = 'panel-reload';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => this.reload());
    this.overlay.append(this.overlayTitle, this.overlayDetail, reload);
    this.element.append(this.overlay);

    this.wireEvents();
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

  /** The <webview> itself, so the room can tell when the pointer is over the page. */
  get view(): HTMLElement {
    return this.webview;
  }

  load(url: string): void {
    this.hideOverlay();
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
    this.hideOverlay();
    this.failed = false;
    if (this.ready) this.webview.reload();
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

  private wireEvents(): void {
    const wv = this.webview;
    wv.addEventListener('dom-ready', () => {
      if (this.ready) return;
      this.ready = true;
      if (this.pendingUrl && this.pendingUrl !== wv.getURL()) {
        const url = this.pendingUrl;
        this.pendingUrl = null;
        this.load(url);
      }
    });
    wv.addEventListener('did-start-loading', () => {
      this.failed = false;
      this.emit({ state: 'loading', url: this.currentStatus.url });
    });
    wv.addEventListener('did-navigate', (e) => {
      this.emit({ ...this.currentStatus, url: e.url });
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (e.isMainFrame) this.emit({ ...this.currentStatus, url: e.url });
    });
    wv.addEventListener('page-title-updated', (e) => {
      this.emit({ ...this.currentStatus, title: e.title });
    });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === ERR_ABORTED) return;
      this.failed = true;
      const message = `${e.errorDescription || 'Unknown error'} (${e.errorCode})`;
      this.showOverlay("Couldn't load this page.", `${e.validatedURL} — ${message}`);
      this.emit({ state: 'failed', url: e.validatedURL, message });
    });
    wv.addEventListener('did-stop-loading', () => {
      if (this.failed || this.currentStatus.state === 'crashed') return;
      this.emit({ ...this.currentStatus, state: 'loaded' });
    });
    wv.addEventListener('render-process-gone', (e) => {
      const message = `The page's process ended (${e.details.reason}).`;
      this.showOverlay('This page stopped working.', message);
      this.emit({ ...this.currentStatus, state: 'crashed', message });
    });
  }

  private showOverlay(title: string, detail: string): void {
    this.overlayTitle.textContent = title;
    this.overlayDetail.textContent = detail;
    this.overlay.setAttribute('data-visible', '');
  }

  private hideOverlay(): void {
    this.overlay.removeAttribute('data-visible');
  }

  private emit(status: PageStatus): void {
    this.currentStatus = status;
    for (const listener of this.listeners) listener(this.status);
  }
}
