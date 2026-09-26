import { LitElement, css, html, nothing, svg } from 'lit';

/**
 * Instrument controls (milestone 7) in the app's own look: glass bezels,
 * the theme's accent glowing on dark or light, monospace readouts. The
 * owner's reference sheet set the kinds of control (dials, meters,
 * readouts, switches), not their look (prompt 34).
 */

const DIAL_SWEEP = 270; // degrees of the dial's scale
const R = 38;

function arc(from: number, to: number): string {
  // Angles in degrees, 0 at the top, clockwise.
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${50 + R * Math.cos(a)} ${50 + R * Math.sin(a)}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return `M ${p(from)} A ${R} ${R} 0 ${large} 1 ${p(to)}`;
}

/** A round gauge: a 270-degree scale, a lit arc for the value, ticks, and a digital readout in the middle. */
export class HsDial extends LitElement {
  static override properties = {
    label: { type: String },
    value: { type: Number },
    max: { type: Number },
    display: { type: String },
    unit: { type: String },
  };

  declare label: string;
  declare value: number;
  declare max: number;
  /** The text in the middle (defaults to the value). */
  declare display: string;
  declare unit: string;

  constructor() {
    super();
    this.label = '';
    this.value = 0;
    this.max = 100;
    this.display = '';
    this.unit = '';
  }

  static override styles = css`
    :host {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      width: 84px;
      color: var(--hs-text);
    }
    svg {
      width: 84px;
      height: 84px;
      overflow: visible;
    }
    .bezel {
      fill: color-mix(in srgb, var(--hs-background-bottom) 55%, var(--hs-panel-glass));
      stroke: color-mix(in srgb, var(--hs-accent) 35%, transparent);
      stroke-width: 1.5;
    }
    .track {
      fill: none;
      stroke: color-mix(in srgb, var(--hs-text-muted) 28%, transparent);
      stroke-width: 7;
      stroke-linecap: round;
    }
    .value {
      fill: none;
      stroke: var(--hs-accent);
      stroke-width: 7;
      stroke-linecap: round;
      filter: drop-shadow(0 0 calc(5px * var(--hs-glow-strength)) var(--hs-accent));
      transition: d 300ms ease;
    }
    .tick {
      stroke: color-mix(in srgb, var(--hs-text-muted) 70%, transparent);
      stroke-width: 1.2;
    }
    .readout {
      font-family: var(--hs-font-mono);
      font-size: 17px;
      fill: var(--hs-accent);
      text-anchor: middle;
    }
    .unit {
      font-family: var(--hs-font-mono);
      font-size: 9px;
      fill: var(--hs-text-muted);
      text-anchor: middle;
    }
    .label {
      margin-top: -6px;
      font-family: var(--hs-font-mono);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--hs-text-muted);
    }
    @media (prefers-reduced-motion: reduce) {
      .value {
        transition: none;
      }
    }
  `;

  override render() {
    const start = -DIAL_SWEEP / 2;
    const f = this.max > 0 ? Math.max(0, Math.min(1, this.value / this.max)) : 0;
    const ticks = Array.from({ length: 10 }, (_, i) => start + (DIAL_SWEEP * i) / 9);
    const text = this.display || String(Math.round(this.value));
    return html`<svg viewBox="0 0 100 100" role="meter" aria-label=${this.label} aria-valuenow=${this.value} aria-valuemin="0" aria-valuemax=${this.max} aria-valuetext=${`${text} ${this.unit}`.trim()}>
        <circle class="bezel" cx="50" cy="50" r="47" />
        ${ticks.map((deg) => {
          const a = ((deg - 90) * Math.PI) / 180;
          return svg`<line class="tick" x1=${50 + 44 * Math.cos(a)} y1=${50 + 44 * Math.sin(a)} x2=${50 + 47 * Math.cos(a)} y2=${50 + 47 * Math.sin(a)} />`;
        })}
        <path class="track" d=${arc(start, start + DIAL_SWEEP)} />
        ${f > 0.004 ? svg`<path class="value" d=${arc(start, start + DIAL_SWEEP * f)} />` : nothing}
        <text class="readout" x="50" y="55">${text}</text>
        <text class="unit" x="50" y="68">${this.unit}</text>
      </svg>
      <span class="label">${this.label}</span>`;
  }
}

/** A segmented bar meter, like an LED level display. */
export class HsMeter extends LitElement {
  static override properties = {
    label: { type: String },
    fraction: { type: Number },
    display: { type: String },
  };

  declare label: string;
  /** 0 to 1. */
  declare fraction: number;
  declare display: string;

  constructor() {
    super();
    this.label = '';
    this.fraction = 0;
    this.display = '';
  }

  static override styles = css`
    :host {
      display: grid;
      grid-template-columns: 64px 1fr auto;
      align-items: center;
      gap: 8px;
      font-family: var(--hs-font-mono);
      font-size: 11px;
    }
    .label {
      color: var(--hs-text-muted);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .bar {
      display: grid;
      grid-template-columns: repeat(16, 1fr);
      gap: 2px;
      height: 10px;
    }
    .seg {
      border-radius: 1px;
      background: color-mix(in srgb, var(--hs-text-muted) 22%, transparent);
    }
    .seg[data-on] {
      background: var(--hs-accent);
      box-shadow: 0 0 calc(4px * var(--hs-glow-strength)) var(--hs-accent);
    }
    .seg[data-hot] {
      background: var(--hs-accent2);
      box-shadow: 0 0 calc(4px * var(--hs-glow-strength)) var(--hs-accent2);
    }
    .value {
      min-width: 7ch;
      text-align: right;
      color: var(--hs-text);
    }
  `;

  override render() {
    const lit = Math.round(Math.max(0, Math.min(1, this.fraction)) * 16);
    return html`<span class="label">${this.label}</span>
      <span class="bar" role="meter" aria-label=${this.label} aria-valuenow=${Math.round(this.fraction * 100)} aria-valuemin="0" aria-valuemax="100" aria-valuetext=${this.display}>
        ${Array.from({ length: 16 }, (_, i) =>
          html`<span class="seg" ?data-on=${i < lit && i < 12} ?data-hot=${i < lit && i >= 12}></span>`,
        )}
      </span>
      <span class="value">${this.display}</span>`;
  }
}

/** A digital readout: a small label over a glowing monospace value. */
export class HsLcd extends LitElement {
  static override properties = {
    label: { type: String },
    value: { type: String },
    tone: { type: String, reflect: true },
  };

  declare label: string;
  declare value: string;
  /** 'normal', 'good', or 'warn'. */
  declare tone: string;

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.tone = 'normal';
  }

  static override styles = css`
    :host {
      display: block;
      min-width: 0;
      padding: 4px 8px 5px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--hs-background-bottom) 60%, transparent);
      border: 1px solid color-mix(in srgb, var(--hs-accent) 22%, transparent);
    }
    .label {
      display: block;
      font-family: var(--hs-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--hs-text-muted);
    }
    .value {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--hs-font-mono);
      font-size: 13px;
      color: var(--hs-accent);
      text-shadow: 0 0 calc(6px * var(--hs-glow-strength)) var(--hs-accent);
    }
    :host([tone='warn']) .value {
      color: var(--hs-warning);
      text-shadow: none;
    }
    :host([tone='good']) .value {
      color: var(--hs-accent);
    }
  `;

  override render() {
    return html`<span class="label">${this.label}</span><span class="value" title=${this.value}>${this.value || '—'}</span>`;
  }
}

/** A toggle switch. Events: change (detail: boolean). */
export class HsSwitch extends LitElement {
  static override properties = {
    label: { type: String },
    checked: { type: Boolean, reflect: true },
  };

  declare label: string;
  declare checked: boolean;

  constructor() {
    super();
    this.label = '';
    this.checked = false;
  }

  static override styles = css`
    :host {
      display: inline-block;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 2px;
      border: 0;
      background: none;
      color: var(--hs-text);
      font: inherit;
      font-family: var(--hs-font-mono);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--hs-accent);
      outline-offset: 2px;
      border-radius: 6px;
    }
    .track {
      position: relative;
      width: 30px;
      height: 16px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--hs-text-muted) 30%, transparent);
      border: 1px solid color-mix(in srgb, var(--hs-accent) 35%, transparent);
    }
    .knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--hs-text-muted);
      transition: left 150ms ease;
    }
    :host([checked]) .track {
      background: color-mix(in srgb, var(--hs-accent) 35%, transparent);
    }
    :host([checked]) .knob {
      left: 16px;
      background: var(--hs-accent);
      box-shadow: 0 0 calc(6px * var(--hs-glow-strength)) var(--hs-accent);
    }
    @media (prefers-reduced-motion: reduce) {
      .knob {
        transition: none;
      }
    }
  `;

  override render() {
    return html`<button role="switch" aria-checked=${this.checked ? 'true' : 'false'} @click=${this.toggle}>
      <span class="track"><span class="knob"></span></span>${this.label}
    </button>`;
  }

  private readonly toggle = () => {
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent('change', { detail: this.checked, bubbles: true, composed: true }));
  };
}

customElements.define('hs-dial', HsDial);
customElements.define('hs-meter', HsMeter);
customElements.define('hs-lcd', HsLcd);
customElements.define('hs-switch', HsSwitch);

declare global {
  interface HTMLElementTagNameMap {
    'hs-dial': HsDial;
    'hs-meter': HsMeter;
    'hs-lcd': HsLcd;
    'hs-switch': HsSwitch;
  }
}
