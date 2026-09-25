import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../../shared/settings';
import type { SavedSession } from '../../shared/data';
import { readTextIfExists, setAside, writeFileAtomic } from './files';

/**
 * settings.json. A damaged file is set aside (kept, renamed) and the
 * defaults are used, so the app always starts.
 */
export class SettingsFile {
  private current: Settings;
  /** Where a damaged file was moved, if one was found at start. */
  readonly setAsideAs: string | null;

  constructor(private readonly path: string) {
    const text = readTextIfExists(path);
    if (text === null) {
      this.current = { ...DEFAULT_SETTINGS };
      this.setAsideAs = null;
      return;
    }
    const parsed = parseSettings(text);
    this.current = parsed.settings;
    this.setAsideAs = parsed.problem ? setAside(path) : null;
  }

  get settings(): Settings {
    return { ...this.current };
  }

  save(settings: Settings): void {
    this.current = { ...settings };
    writeFileAtomic(this.path, `${JSON.stringify(this.current, null, 2)}\n`);
  }
}

/** Reads a session file's text: web addresses only; anything else gives null. */
export function parseSession(text: string | null): SavedSession | null {
  if (text === null) return null;
  try {
    const data = JSON.parse(text) as unknown;
    if (typeof data !== 'object' || data === null) return null;
    const { tabs, focused } = data as Record<string, unknown>;
    if (!Array.isArray(tabs)) return null;
    const urls = tabs.filter((t): t is string => typeof t === 'string' && /^https?:\/\//i.test(t));
    if (urls.length === 0) return null;
    const f = Number.isInteger(focused) && (focused as number) >= 0 && (focused as number) < urls.length ? (focused as number) : 0;
    return { tabs: urls, focused: f };
  } catch {
    return null;
  }
}

/** session.json: the open tabs, for "reopen your tabs from last time". */
export class SessionFile {
  constructor(private readonly path: string) {}

  load(): SavedSession | null {
    try {
      return parseSession(readTextIfExists(this.path));
    } catch {
      return null;
    }
  }

  save(session: SavedSession): void {
    writeFileAtomic(this.path, `${JSON.stringify(session)}\n`);
  }
}
