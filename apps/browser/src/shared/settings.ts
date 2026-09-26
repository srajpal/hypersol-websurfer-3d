/**
 * Settings shared by the main process (which stores them) and the shell
 * (which shows them). Pure, so both sides and the unit tests use it.
 */

export const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
} as const;

export type SearchEngineId = keyof typeof SEARCH_ENGINES;
export type StartupMode = 'new-tab' | 'last-tabs';
/**
 * Encrypted DNS (ARCHITECTURE.md section 4): 'secure' uses only the named
 * resolver; 'automatic' uses it where it can and falls back to the
 * network's own DNS.
 */
export type DnsMode = 'secure' | 'automatic';

export interface Settings {
  searchEngine: SearchEngineId;
  onStartup: StartupMode;
  dnsMode: DnsMode;
  /** Refresh the filter lists from the internet once a day. */
  filterRefresh: boolean;
  /** Sites (host names) where the privacy shield is paused. */
  pausedSites: string[];
  /** Pages open in the layers view (milestone 5), unless the site has its own choice. */
  layersOnOpen: boolean;
  /** Per-site choice for the layers view, by host name; set when the view is switched on a page. */
  layersSites: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  searchEngine: 'duckduckgo',
  onStartup: 'new-tab',
  dnsMode: 'secure',
  filterRefresh: true,
  pausedSites: Object.freeze([]) as unknown as string[],
  layersOnOpen: true,
  layersSites: Object.freeze({}) as Record<string, boolean>,
});

const SETTING_KEYS = ['searchEngine', 'onStartup', 'dnsMode', 'filterRefresh', 'pausedSites', 'layersOnOpen', 'layersSites'] as const;
export const MAX_PAUSED_SITES = 1000;
export const MAX_LAYERS_SITES = 1000;

/** A host name as URL.hostname gives it: letters, digits, dots, hyphens, or a bracketed IPv6 address. */
export function isHostName(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 255 && /^([a-z0-9.-]+|\[[0-9a-f:.]+\])$/i.test(v);
}

const isEngine = (v: unknown): v is SearchEngineId => typeof v === 'string' && Object.hasOwn(SEARCH_ENGINES, v);
const isStartup = (v: unknown): v is StartupMode => v === 'new-tab' || v === 'last-tabs';
const isDnsMode = (v: unknown): v is DnsMode => v === 'secure' || v === 'automatic';

/**
 * Applies a change to settings. Unknown keys and bad values are refused
 * with a reason, so neither a damaged file nor a bad request can put a
 * wrong value in place.
 */
export function applySettingsPatch(current: Settings, patch: unknown): { settings: Settings } | { error: string } {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return { error: 'Not a settings object' };
  const next: Settings = { ...current, pausedSites: [...current.pausedSites], layersSites: { ...current.layersSites } };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'searchEngine') {
      if (!isEngine(value)) return { error: `Unknown search engine: ${String(value)}` };
      next.searchEngine = value;
    } else if (key === 'onStartup') {
      if (!isStartup(value)) return { error: `Unknown startup choice: ${String(value)}` };
      next.onStartup = value;
    } else if (key === 'dnsMode') {
      if (!isDnsMode(value)) return { error: `Unknown DNS mode: ${String(value)}` };
      next.dnsMode = value;
    } else if (key === 'filterRefresh') {
      if (typeof value !== 'boolean') return { error: 'filterRefresh must be true or false' };
      next.filterRefresh = value;
    } else if (key === 'pausedSites') {
      if (!Array.isArray(value) || value.length > MAX_PAUSED_SITES || !value.every(isHostName)) {
        return { error: 'pausedSites must be a list of host names' };
      }
      next.pausedSites = [...new Set(value.map((h: string) => h.toLowerCase()))];
    } else if (key === 'layersOnOpen') {
      if (typeof value !== 'boolean') return { error: 'layersOnOpen must be true or false' };
      next.layersOnOpen = value;
    } else if (key === 'layersSites') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return { error: 'layersSites must map host names to true or false' };
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > MAX_LAYERS_SITES || !entries.every(([h, v]) => isHostName(h) && typeof v === 'boolean')) {
        return { error: 'layersSites must map host names to true or false' };
      }
      next.layersSites = Object.fromEntries(entries.map(([h, v]) => [h.toLowerCase(), v as boolean]));
    } else {
      return { error: `Unknown setting: ${key}` };
    }
  }
  return { settings: next };
}

/** A fresh copy of the defaults (the list inside is never shared). */
export function defaults(): Settings {
  return { ...DEFAULT_SETTINGS, pausedSites: [], layersSites: {} };
}

/**
 * Reads a settings file's text. Anything unreadable gives the defaults and
 * a problem to report; unknown keys in an otherwise good file are ignored,
 * so a newer file still opens.
 */
export function parseSettings(text: string): { settings: Settings; problem?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { settings: defaults(), problem: 'not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { settings: defaults(), problem: 'not a settings object' };
  }
  const known = Object.fromEntries(
    Object.entries(data).filter(([k]) => (SETTING_KEYS as readonly string[]).includes(k)),
  );
  const result = applySettingsPatch(defaults(), known);
  if ('error' in result) return { settings: defaults(), problem: result.error };
  return { settings: result.settings };
}

export function searchUrlFor(settings: Settings): string {
  return SEARCH_ENGINES[settings.searchEngine].url;
}
