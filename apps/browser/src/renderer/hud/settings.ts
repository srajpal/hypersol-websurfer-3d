import { LitElement, css, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { DEFAULT_SETTINGS, SEARCH_ENGINES, type SearchEngineId, type Settings, type StartupMode } from '../../shared/settings';
import type { DataClient } from '../data';
import { panelStyles } from './panel-styles';

/**
 * The Settings panel: search engine, what opens at startup, and clearing
 * browsing data. Changes save at once. Escape closes it.
 *
 * Events: hs-panel-closed, hs-settings-changed (detail: Settings).
 */
export class HsSettings extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    settings: { state: true },
    message: { state: true },
    problem: { state: true },
    confirming: { state: true },
    choices: { state: true },
  };

  declare open: boolean;
  declare settings: Settings;
  declare message: string;
  declare problem: string;
  declare confirming: boolean;
  declare choices: { history: boolean; cookies: boolean; cache: boolean };
  client: DataClient | null = null;

  constructor() {
    super();
    this.open = false;
    this.settings = { ...DEFAULT_SETTINGS };
    this.message = '';
    this.problem = '';
    this.confirming = false;
    this.choices = { history: true, cookies: false, cache: false };
  }

  static override styles = [
    panelStyles,
    css`
      .body {
        flex: 1;
        overflow: auto;
      }
      fieldset {
        margin: 0 0 16px;
        padding: 0;
        border: 0;
      }
      legend {
        padding: 0;
        margin: 6px 0 8px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--hs-text-muted);
      }
      label {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 2px;
        cursor: pointer;
      }
      input[type='radio'],
      input[type='checkbox'] {
        accent-color: var(--hs-accent);
        width: 16px;
        height: 16px;
        margin: 0;
      }
      .actions {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 8px;
      }
    `,
  ];

  /** Opens the panel and loads the current settings. */
  show(): void {
    this.open = true;
    this.confirming = false;
    this.message = '';
    void this.load();
    void this.updateComplete.then(() =>
      (this.renderRoot.querySelector('input[type="radio"]:checked') as HTMLInputElement | null)?.focus(),
    );
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.confirming = false;
    this.dispatchEvent(new CustomEvent('hs-panel-closed', { bubbles: true, composed: true }));
  }

  async load(): Promise<void> {
    if (!this.client) return;
    try {
      this.settings = await this.client.get({ op: 'settings.get' });
      const status = await this.client.get({ op: 'status' });
      this.problem = status.settingsProblem ?? '';
    } catch (e) {
      this.message = e instanceof Error ? e.message : String(e);
    }
  }

  override render() {
    return html`
      <section role="dialog" aria-label="Settings" data-testid="settings" @keydown=${this.onKey}>
        <header>
          <h2>Settings</h2>
          <button class="icon-button" aria-label="Close Settings" data-testid="settings-close" @click=${() => this.close()}>
            ×
          </button>
        </header>
        <div class="body">
          ${this.problem ? html`<p class="error" role="alert" data-testid="set-problem">${this.problem}</p>` : nothing}
          <fieldset>
            <legend>Search engine</legend>
            ${(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map(
              (id) => html`<label>
                <input
                  type="radio"
                  name="engine"
                  data-testid=${`set-engine-${id}`}
                  .checked=${live(this.settings.searchEngine === id)}
                  @change=${() => this.save({ searchEngine: id })}
                />
                ${SEARCH_ENGINES[id].name}
              </label>`,
            )}
          </fieldset>
          <fieldset>
            <legend>On startup</legend>
            ${this.startup('new-tab', 'Open a new tab')} ${this.startup('last-tabs', 'Reopen your tabs from last time')}
          </fieldset>
          <fieldset>
            <legend>Clear browsing data</legend>
            ${this.choice('history', 'History')} ${this.choice('cookies', 'Cookies and site data')}
            ${this.choice('cache', 'Cached files')}
            <div class="actions">
              ${this.confirming
                ? html`<div class="confirm" role="alertdialog" aria-label="Clear browsing data">
                    <p>Clear the selected data? This can't be undone.</p>
                    <button class="danger" data-testid="set-clear-confirm" @click=${this.clear}>Clear</button>
                    <button data-testid="set-clear-cancel" @click=${() => (this.confirming = false)}>Cancel</button>
                  </div>`
                : html`<button
                    class="danger"
                    data-testid="set-clear"
                    ?disabled=${!this.choices.history && !this.choices.cookies && !this.choices.cache}
                    @click=${() => (this.confirming = true)}
                  >
                    Clear data
                  </button>`}
            </div>
          </fieldset>
          ${this.message ? html`<p class="muted" role="status" data-testid="set-message">${this.message}</p>` : nothing}
        </div>
      </section>
    `;
  }

  private startup(mode: StartupMode, label: string) {
    return html`<label>
      <input
        type="radio"
        name="startup"
        data-testid=${`set-startup-${mode}`}
        .checked=${live(this.settings.onStartup === mode)}
        @change=${() => this.save({ onStartup: mode })}
      />
      ${label}
    </label>`;
  }

  private choice(key: 'history' | 'cookies' | 'cache', label: string) {
    return html`<label>
      <input
        type="checkbox"
        data-testid=${`set-clear-${key}`}
        .checked=${this.choices[key]}
        @change=${(e: Event) => (this.choices = { ...this.choices, [key]: (e.target as HTMLInputElement).checked })}
      />
      ${label}
    </label>`;
  }

  private async save(patch: Partial<Settings>): Promise<void> {
    if (!this.client) return;
    try {
      this.settings = await this.client.get({ op: 'settings.set', patch });
      this.problem = '';
      this.message = 'Saved.';
      this.dispatchEvent(new CustomEvent('hs-settings-changed', { detail: this.settings, bubbles: true, composed: true }));
    } catch (e) {
      this.message = e instanceof Error ? e.message : String(e);
      // Show the settings actually in use: the failed change did not happen.
      await this.load();
      this.requestUpdate();
    }
  }

  private readonly clear = async () => {
    this.confirming = false;
    if (!this.client) return;
    try {
      await this.client.get({ op: 'data.clear', ...this.choices });
      this.message = 'Cleared.';
    } catch (e) {
      this.message = e instanceof Error ? e.message : String(e);
    }
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (this.confirming) this.confirming = false;
      else this.close();
    }
  };
}

customElements.define('hs-settings', HsSettings);

declare global {
  interface HTMLElementTagNameMap {
    'hs-settings': HsSettings;
  }
}
