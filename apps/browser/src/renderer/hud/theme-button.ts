import { LitElement, css, html } from 'lit';

/**
 * The theme switch at the bottom right, beside the shield
 * (ARCHITECTURE.md section 9): switches between Nebula and Daylight.
 * Settings > Theme has the full choice, including matching the system.
 *
 * Events: hs-theme-toggle.
 */
export class HsThemeButton extends LitElement {
  static override properties = {
    scheme: { type: String, reflect: true },
    themeName: { type: String },
  };

  /** The scheme in use: 'dark' shows the sun (switch to Daylight), 'light' the moon. */
  declare scheme: 'dark' | 'light';
  declare themeName: string;

  constructor() {
    super();
    this.scheme = 'dark';
    this.themeName = 'Nebula';
  }

  static override styles = css`
    :host {
      position: fixed;
      right: 112px;
      bottom: 24px;
      z-index: 14;
      display: block;
    }
    button {
      display: grid;
      place-items: center;
      width: 36px;
      height: 34px;
      padding: 0;
      cursor: pointer;
      color: var(--hs-accent);
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--hs-accent) 60%, transparent);
      background: color-mix(in srgb, var(--hs-panel-glass) 92%, transparent);
      box-shadow: 0 0 calc(18px * var(--hs-glow-strength)) color-mix(in srgb, var(--hs-accent) 30%, transparent);
    }
    button:hover {
      background: color-mix(in srgb, var(--hs-accent) 16%, var(--hs-panel-glass));
    }
    button:focus-visible {
      outline: 2px solid var(--hs-accent);
      outline-offset: 2px;
    }
    svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
  `;

  override render() {
    const next = this.scheme === 'dark' ? 'Daylight' : 'Nebula';
    const label = `Theme: ${this.themeName}. Switch to ${next}`;
    const toggle = () => this.dispatchEvent(new CustomEvent('hs-theme-toggle', { bubbles: true, composed: true }));
    return html`<button data-testid="theme" aria-label=${label} title=${label} @click=${toggle}>
      ${this.scheme === 'dark'
        ? html`<svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>`
        : html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>`}
    </button>`;
  }
}

customElements.define('hs-theme-button', HsThemeButton);

declare global {
  interface HTMLElementTagNameMap {
    'hs-theme-button': HsThemeButton;
  }
}
