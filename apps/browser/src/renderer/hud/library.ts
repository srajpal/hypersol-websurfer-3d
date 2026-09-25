import { LitElement, css, html, nothing } from 'lit';
import type { Bookmark, HistoryEntry } from '../../shared/data';
import { groupByDay, type DataClient } from '../data';
import { panelStyles } from './panel-styles';

type View = 'bookmarks' | 'history';

/**
 * The Library panel: bookmarks and history. Slides in from the right;
 * Escape or the close button closes it.
 *
 * Events: hs-open-url (detail: address), hs-panel-closed.
 */
export class HsLibrary extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    view: { state: true },
    query: { state: true },
    loading: { state: true },
    error: { state: true },
    bookmarks: { state: true },
    history: { state: true },
    confirming: { state: true },
  };

  declare open: boolean;
  declare view: View;
  declare query: string;
  declare loading: boolean;
  declare error: string;
  declare bookmarks: Bookmark[];
  declare history: HistoryEntry[];
  declare confirming: boolean;
  client: DataClient | null = null;
  private request = 0;
  /** A refresh is running; another was asked for meanwhile. */
  private running = false;
  private again = false;
  private searchTimer: number | undefined;

  constructor() {
    super();
    this.open = false;
    this.view = 'bookmarks';
    this.query = '';
    this.loading = false;
    this.error = '';
    this.bookmarks = [];
    this.history = [];
    this.confirming = false;
  }

  static override styles = [
    panelStyles,
    css`
      [role='tablist'] {
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
      }
      [role='tab'][aria-selected='true'] {
        background: color-mix(in srgb, var(--hs-accent) 25%, transparent);
      }
      input[type='search'] {
        box-sizing: border-box;
        width: 100%;
        height: 34px;
        padding: 0 12px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, var(--hs-text-muted) 60%, transparent);
        background: color-mix(in srgb, var(--hs-background-bottom) 60%, transparent);
      }
      .list {
        flex: 1;
        overflow: auto;
        margin-top: 6px;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .item {
        flex: 1;
        min-width: 0;
        display: grid;
        grid-template-columns: 20px 1fr;
        column-gap: 10px;
        align-items: center;
        border: 0;
        text-align: left;
        padding: 7px 8px;
      }
      .item img,
      .item .dot {
        width: 16px;
        height: 16px;
        grid-row: span 2;
        border-radius: 3px;
      }
      .item .dot {
        background: color-mix(in srgb, var(--hs-accent) 40%, transparent);
      }
      .title,
      .url {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .url {
        font-size: 12px;
        color: var(--hs-text-muted);
      }
      footer {
        margin-top: 10px;
      }
    `,
  ];

  /** Opens the panel on a view and loads it. */
  show(view: View = this.view): void {
    this.view = view;
    this.open = true;
    this.confirming = false;
    void this.refresh();
    void this.updateComplete.then(() => (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.focus());
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.confirming = false;
    this.dispatchEvent(new CustomEvent('hs-panel-closed', { bubbles: true, composed: true }));
  }

  /**
   * Reloads the current view (also called when saved data changes).
   * Requests made while one is running are merged into a single follow-up,
   * and a reply that a newer request has overtaken is dropped (GitHub
   * issue #4).
   */
  async refresh(): Promise<void> {
    if (!this.open || !this.client) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        await this.load();
      } while (this.again && this.open);
    } finally {
      this.running = false;
    }
  }

  private async load(): Promise<void> {
    if (!this.client) return;
    const ticket = ++this.request;
    this.loading = true;
    try {
      const status = await this.client.get({ op: 'status' });
      if (!status.available) throw new Error(status.message ?? "Couldn't open your saved data");
      if (this.view === 'bookmarks') {
        const all = await this.client.get({ op: 'bookmarks.list' });
        if (ticket !== this.request) return;
        this.bookmarks = all;
      } else {
        const found = await this.client.get({ op: 'history.search', query: this.query, limit: 500 });
        if (ticket !== this.request) return;
        this.history = found;
      }
      this.error = '';
    } catch (e) {
      if (ticket !== this.request) return;
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (ticket === this.request) this.loading = false;
    }
  }

  override render() {
    return html`
      <section role="dialog" aria-label="Library" data-testid="library" @keydown=${this.onKey}>
        <header>
          <h2>Library</h2>
          <button class="icon-button" aria-label="Close Library" data-testid="library-close" @click=${() => this.close()}>
            ×
          </button>
        </header>
        <div role="tablist" aria-label="Library views">
          ${this.tab('bookmarks', 'Bookmarks')} ${this.tab('history', 'History')}
        </div>
        <input
          type="search"
          data-testid="lib-search"
          aria-label=${this.view === 'bookmarks' ? 'Search bookmarks' : 'Search history'}
          placeholder=${this.view === 'bookmarks' ? 'Search bookmarks' : 'Search history'}
          .value=${this.query}
          @input=${this.onSearch}
        />
        <div class="list" data-testid="lib-list">${this.body()}</div>
        ${this.view === 'history' && !this.error ? this.footer() : nothing}
      </section>
    `;
  }

  private tab(view: View, label: string) {
    return html`<button
      role="tab"
      data-testid=${`lib-tab-${view}`}
      aria-selected=${this.view === view ? 'true' : 'false'}
      @click=${() => {
        this.view = view;
        this.confirming = false;
        void this.refresh();
      }}
    >
      ${label}
    </button>`;
  }

  private body() {
    if (this.error) return html`<p class="error" data-testid="lib-error" role="alert">${this.error}</p>`;
    if (this.loading && this.items().length === 0) return html`<p class="muted">Loading…</p>`;
    if (this.view === 'bookmarks') {
      const shown = this.filteredBookmarks();
      if (shown.length === 0) return this.empty('Pages you bookmark will show up here. Use the star or Ctrl+D.');
      return html`<ul>
        ${shown.map(
          (b) => html`<li>
            ${this.item(b.url, b.title, b.favicon)}
            <button
              class="icon-button"
              data-testid="lib-remove"
              aria-label=${`Remove bookmark ${b.title}`}
              @click=${() => this.removeBookmark(b.url)}
            >
              ×
            </button>
          </li>`,
        )}
      </ul>`;
    }
    if (this.history.length === 0) return this.empty('Pages you visit will show up here.');
    return groupByDay(this.history).map(
      (g) => html`<h3>${g.label}</h3>
        <ul>
          ${g.items.map(
            (h) => html`<li>
              ${this.item(h.url, h.title, null, h.visitedAt)}
              <button
                class="icon-button"
                data-testid="lib-delete"
                aria-label=${`Delete ${h.title} from history`}
                @click=${() => this.deleteVisit(h.id)}
              >
                ×
              </button>
            </li>`,
          )}
        </ul>`,
    );
  }

  private item(url: string, title: string, favicon: string | null, time?: number) {
    const when = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return html`<button class="item" data-testid="lib-item" title=${url} @click=${() => this.openUrl(url)}>
      ${favicon ? html`<img src=${favicon} alt="" />` : html`<span class="dot"></span>`}
      <span class="title">${title || url}</span>
      <span class="url">${when ? `${when} · ` : ''}${url}</span>
    </button>`;
  }

  private empty(hint: string) {
    return html`<p class="empty" data-testid="lib-empty">${this.query ? 'Nothing found' : 'Nothing saved yet'}</p>
      <p class="muted">${this.query ? 'Try other words.' : hint}</p>`;
  }

  private footer() {
    if (this.history.length === 0 && !this.confirming) return nothing;
    return html`<footer>
      ${this.confirming
        ? html`<div class="confirm" role="alertdialog" aria-label="Clear all history">
            <p>Clear all history? This can't be undone.</p>
            <button class="danger" data-testid="lib-clear-confirm" @click=${this.clearAll}>Clear</button>
            <button data-testid="lib-clear-cancel" @click=${() => (this.confirming = false)}>Cancel</button>
          </div>`
        : html`<button class="danger" data-testid="lib-clear" @click=${() => (this.confirming = true)}>
            Clear all history
          </button>`}
    </footer>`;
  }

  private items(): unknown[] {
    return this.view === 'bookmarks' ? this.bookmarks : this.history;
  }

  private filteredBookmarks(): Bookmark[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.bookmarks;
    return this.bookmarks.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
  }

  /** History searches wait until typing pauses for 200 ms. */
  private readonly onSearch = (e: Event) => {
    this.query = (e.target as HTMLInputElement).value;
    if (this.view !== 'history') return;
    window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => void this.refresh(), 200);
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (this.confirming) this.confirming = false;
      else this.close();
    }
  };

  private readonly clearAll = async () => {
    this.confirming = false;
    await this.act(() => this.client!.get({ op: 'history.clear' }));
  };

  private async removeBookmark(url: string): Promise<void> {
    await this.act(() => this.client!.get({ op: 'bookmarks.remove', url }));
  }

  private async deleteVisit(id: number): Promise<void> {
    await this.act(() => this.client!.get({ op: 'history.delete', id }));
  }

  private async act(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    await this.refresh();
  }

  private openUrl(url: string): void {
    this.dispatchEvent(new CustomEvent('hs-open-url', { detail: url, bubbles: true, composed: true }));
  }
}

customElements.define('hs-library', HsLibrary);

declare global {
  interface HTMLElementTagNameMap {
    'hs-library': HsLibrary;
  }
}
