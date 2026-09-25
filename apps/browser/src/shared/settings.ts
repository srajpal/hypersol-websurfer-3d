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

export interface Settings {
  searchEngine: SearchEngineId;
  onStartup: StartupMode;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  searchEngine: 'duckduckgo',
  onStartup: 'new-tab',
});

const isEngine = (v: unknown): v is SearchEngineId => typeof v === 'string' && Object.hasOwn(SEARCH_ENGINES, v);
const isStartup = (v: unknown): v is StartupMode => v === 'new-tab' || v === 'last-tabs';

/**
 * Applies a change to settings. Unknown keys and bad values are refused
 * with a reason, so neither a damaged file nor a bad request can put a
 * wrong value in place.
 */
export function applySettingsPatch(current: Settings, patch: unknown): { settings: Settings } | { error: string } {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return { error: 'Not a settings object' };
  const next: Settings = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'searchEngine') {
      if (!isEngine(value)) return { error: `Unknown search engine: ${String(value)}` };
      next.searchEngine = value;
    } else if (key === 'onStartup') {
      if (!isStartup(value)) return { error: `Unknown startup choice: ${String(value)}` };
      next.onStartup = value;
    } else {
      return { error: `Unknown setting: ${key}` };
    }
  }
  return { settings: next };
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
    return { settings: { ...DEFAULT_SETTINGS }, problem: 'not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { settings: { ...DEFAULT_SETTINGS }, problem: 'not a settings object' };
  }
  const known = Object.fromEntries(
    Object.entries(data).filter(([k]) => k === 'searchEngine' || k === 'onStartup'),
  );
  const result = applySettingsPatch({ ...DEFAULT_SETTINGS }, known);
  if ('error' in result) return { settings: { ...DEFAULT_SETTINGS }, problem: result.error };
  return { settings: result.settings };
}

export function searchUrlFor(settings: Settings): string {
  return SEARCH_ENGINES[settings.searchEngine].url;
}
