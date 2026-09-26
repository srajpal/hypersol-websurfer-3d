import { LitElement, css, html, nothing } from 'lit';

/**
 * Find in page (milestone 8): a bar under the top bar with the match
 * count, next and previous (Enter and Shift+Enter), and Escape to close.
 *
 * Events: hs-find (detail: { text, forward, next }), hs-find-closed.
 */
export class HsFindBar extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    matchCount: { type: Number },
    active: { type: Number },
    text: { state: true },
  };

  declare open: boolean;
  declare matchCount: number;
  declare active: number;
  declare text: string;

  constructor() {
    super();
    this.open = false;
    this.matchCount = 0;
    this.active = 0;
    this.text = '';
  }

  static override styles = css`
    :host {
      position: fixed;
      top: 62px;
      right: 24px;
      z-index: 21;
      display: none;
    }
    :host([open]) {
      display: block;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--hs-accent) 50%, transparent);
      background: color-mix(in srgb, var(--hs-panel-glass) 96%, transparent);
      color: var(--hs-text);
      box-shadow: 0 8px 28px var(--hs-shadow);
      font-size: 13px;
    }
    input {
      width: 220px;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--hs-accent) 35%, transparent);
      background: color-mix(in srgb, var(--hs-background-bottom) 55%, transparent);
      color: inherit;
      font: inherit;
    }
    .count {
      min-width: 7ch;
      text-align: right;
      font-family: var(--hs-font-mono);
      color: var(--hs-text-muted);
    }
    .count[data-none] {
      color: var(--hs-warning);
    }
    button {
      width: 28px;
      height: 26px;
      padding: 0;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--hs-accent) 45%, transparent);
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      background: color-mix(in srgb, var(--hs-accent) 16%, transparent);
    }
    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--hs-accent);
      outline-offset: 1px;
    }
  `;

  /** Opens the bar with the keyboard in its field, the text selected. */
  show(): void {
    this.open = true;
    void this.updateComplete.then(() => {
      const input = this.renderRoot.querySelector('input');
      input?.focus();
      input?.select();
    });
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent('hs-find-closed', { bubbles: true, composed: true }));
  }

  override render() {
    if (!this.open) return nothing;
    const none = this.text !== '' && this.matchCount === 0;
    return html`<div class="bar" role="search" aria-label="Find in page" data-testid="find-bar" @keydown=${this.onKey}>
      <input
        data-testid="find-input"
        aria-label="Find in page"
        placeholder="Find in page"
        .value=${this.text}
        @input=${(e: Event) => {
          this.text = (e.target as HTMLInputElement).value;
          this.find(true, false);
        }}
      />
      <span class="count" data-testid="find-count" ?data-none=${none} aria-live="polite">
        ${this.text === '' ? '' : `${this.active}/${this.matchCount}`}
      </span>
      <button data-testid="find-prev" aria-label="Previous match" title="Previous (Shift+Enter)" @click=${() => this.find(false, true)}>↑</button>
      <button data-testid="find-next" aria-label="Next match" title="Next (Enter)" @click=${() => this.find(true, true)}>↓</button>
      <button data-testid="find-close" aria-label="Close find" title="Close (Escape)" @click=${() => this.close()}>×</button>
    </div>`;
  }

  private find(forward: boolean, next: boolean): void {
    if (this.text === '') {
      this.matchCount = 0;
      this.active = 0;
    }
    this.dispatchEvent(new CustomEvent('hs-find', { detail: { text: this.text, forward, next }, bubbles: true, composed: true }));
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.find(!e.shiftKey, true);
    }
  };
}

customElements.define('hs-find-bar', HsFindBar);

declare global {
  interface HTMLElementTagNameMap {
    'hs-find-bar': HsFindBar;
  }
}
