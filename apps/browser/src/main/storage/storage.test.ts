import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDataRequest } from '../../shared/data';
import { DEFAULT_SETTINGS, applySettingsPatch, parseSettings, searchUrlFor } from '../../shared/settings';
import { SCHEMA_VERSION, Store } from './database';
import { StorageService } from './service';
import { parseSession } from './settings-file';

describe('Store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(':memory:');
  });
  afterEach(() => store.close());

  it('creates the current schema', () => {
    expect(store.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('adds, lists, updates, and removes bookmarks', () => {
    store.addBookmark('https://a.example/', 'A', null, 1000);
    store.addBookmark('https://b.example/', 'B', 'data:image/png;base64,xx', 2000);
    expect(store.listBookmarks().map((b) => b.title)).toEqual(['B', 'A']);
    expect(store.hasBookmark('https://a.example/')).toBe(true);
    const again = store.addBookmark('https://a.example/', 'A renamed', null, 3000);
    expect(again.title).toBe('A renamed');
    expect(store.listBookmarks()).toHaveLength(2);
    store.removeBookmark('https://a.example/');
    expect(store.hasBookmark('https://a.example/')).toBe(false);
  });

  it('records visits, searches them, and keeps the latest per address', () => {
    store.recordVisit('https://a.example/one', 'First page', 1000);
    const id = store.recordVisit('https://b.example/', 'b.example', 2000);
    store.updateVisitTitle(id, 'Second page');
    store.recordVisit('https://a.example/one', 'First page', 3000);
    expect(store.searchHistory('', 10).map((h) => h.visitedAt)).toEqual([3000, 2000, 1000]);
    expect(store.searchHistory('second', 10).map((h) => h.title)).toEqual(['Second page']);
    expect(store.searchHistory('a.example', 10)).toHaveLength(2);
    expect(store.recentHistory(10).map((h) => h.url)).toEqual(['https://a.example/one', 'https://b.example/']);
  });

  it('treats % and _ in a search as plain characters', () => {
    store.recordVisit('https://a.example/', '50% off', 1000);
    store.recordVisit('https://b.example/', '500 things', 2000);
    expect(store.searchHistory('50%', 10).map((h) => h.title)).toEqual(['50% off']);
  });

  it('deletes one visit or all of them', () => {
    const id = store.recordVisit('https://a.example/', 'A', 1000);
    store.recordVisit('https://b.example/', 'B', 2000);
    store.deleteVisit(id);
    expect(store.searchHistory('', 10).map((h) => h.title)).toEqual(['B']);
    store.clearHistory();
    expect(store.searchHistory('', 10)).toEqual([]);
  });
});

describe('settings', () => {
  it('parses a good file and ignores unknown keys', () => {
    expect(parseSettings('{"searchEngine":"brave","onStartup":"last-tabs","later":1}')).toEqual({
      settings: { searchEngine: 'brave', onStartup: 'last-tabs' },
    });
  });

  it('falls back to defaults for a damaged file, with a reason', () => {
    expect(parseSettings('{oops')).toEqual({ settings: DEFAULT_SETTINGS, problem: 'not valid JSON' });
    expect(parseSettings('[]').problem).toBe('not a settings object');
    expect(parseSettings('{"searchEngine":"altavista"}').problem).toContain('Unknown search engine');
  });

  it('refuses bad changes', () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { onStartup: 'sometimes' })).toHaveProperty('error');
    expect(applySettingsPatch(DEFAULT_SETTINGS, { theme: 'x' })).toEqual({ error: 'Unknown setting: theme' });
    expect(applySettingsPatch(DEFAULT_SETTINGS, null)).toHaveProperty('error');
  });

  it('knows every search engine address', () => {
    for (const engine of ['duckduckgo', 'brave', 'startpage', 'google', 'bing'] as const) {
      const url = searchUrlFor({ ...DEFAULT_SETTINGS, searchEngine: engine });
      expect(url).toMatch(/^https:\/\/.+%s/);
    }
  });
});

describe('parseSession', () => {
  it('keeps only web addresses and a valid focus', () => {
    expect(parseSession('{"tabs":["https://a.example/","file:///x","http://b.example/"],"focused":1}')).toEqual({
      tabs: ['https://a.example/', 'http://b.example/'],
      focused: 1,
    });
    expect(parseSession('{"tabs":["https://a.example/"],"focused":9}')).toEqual({ tabs: ['https://a.example/'], focused: 0 });
    expect(parseSession('{"tabs":[]}')).toBeNull();
    expect(parseSession('not json')).toBeNull();
    expect(parseSession(null)).toBeNull();
  });
});

describe('parseDataRequest', () => {
  it('accepts well-formed requests', () => {
    expect(parseDataRequest({ op: 'bookmarks.add', url: 'https://a.example/', title: 'A', favicon: null })).toHaveProperty(
      'request',
    );
    expect(parseDataRequest({ op: 'session.save', tabs: ['https://a.example/'], focused: 0 })).toHaveProperty('request');
    expect(parseDataRequest({ op: 'session.save', tabs: [], focused: -1 })).toHaveProperty('request');
  });

  it('refuses anything else', () => {
    expect(parseDataRequest(null)).toHaveProperty('error');
    expect(parseDataRequest({ op: 'drop.tables' })).toHaveProperty('error');
    expect(parseDataRequest({ op: 'bookmarks.add', url: 'file:///etc/passwd', title: 'x', favicon: null })).toHaveProperty(
      'error',
    );
    expect(parseDataRequest({ op: 'bookmarks.add', url: 'https://a.example/', title: 'x', favicon: 'javascript:1' })).toHaveProperty(
      'error',
    );
    expect(parseDataRequest({ op: 'history.search', query: 'a', limit: 1e9 })).toHaveProperty('error');
    expect(parseDataRequest({ op: 'history.delete', id: -1 })).toHaveProperty('error');
    expect(parseDataRequest({ op: 'session.save', tabs: ['https://a.example/'], focused: 3 })).toHaveProperty('error');
    expect(parseDataRequest({ op: 'data.clear', history: 'yes', cookies: false, cache: false })).toHaveProperty('error');
  });
});

describe('StorageService', () => {
  let folder: string;
  const cleared: string[] = [];
  const cleaner = {
    clearCookiesAndSiteData: async () => void cleared.push('cookies'),
    clearCache: async () => void cleared.push('cache'),
  };
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'hypersol-storage-'));
    cleared.length = 0;
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('keeps bookmarks, history, and settings across a restart', async () => {
    const a = new StorageService(folder, cleaner);
    await a.handle({ op: 'bookmarks.add', url: 'https://a.example/', title: 'A', favicon: null });
    a.recordVisit('https://a.example/', 'A');
    await a.handle({ op: 'settings.set', patch: { searchEngine: 'bing' } });
    a.close();
    const b = new StorageService(folder, cleaner);
    expect(await b.handle({ op: 'bookmarks.list' })).toMatchObject({ ok: true, value: [{ url: 'https://a.example/' }] });
    expect(await b.handle({ op: 'history.recent', limit: 5 })).toMatchObject({ ok: true, value: [{ title: 'A' }] });
    expect(await b.handle({ op: 'settings.get' })).toEqual({ ok: true, value: { searchEngine: 'bing', onStartup: 'new-tab' } });
    expect(JSON.parse(readFileSync(join(folder, 'settings.json'), 'utf8'))).toEqual({ searchEngine: 'bing', onStartup: 'new-tab' });
    b.close();
  });

  it('returns saved tabs at startup only when asked to', async () => {
    const s = new StorageService(folder, cleaner);
    await s.handle({ op: 'session.save', tabs: ['https://a.example/', 'https://b.example/'], focused: 1 });
    expect(await s.handle({ op: 'startup' })).toEqual({ ok: true, value: null });
    await s.handle({ op: 'settings.set', patch: { onStartup: 'last-tabs' } });
    expect(await s.handle({ op: 'startup' })).toEqual({
      ok: true,
      value: { tabs: ['https://a.example/', 'https://b.example/'], focused: 1 },
    });
    s.close();
  });

  it('sets a damaged settings file aside and uses the defaults', async () => {
    writeFileSync(join(folder, 'settings.json'), '{not json');
    const s = new StorageService(folder, cleaner);
    expect(await s.handle({ op: 'settings.get' })).toEqual({ ok: true, value: DEFAULT_SETTINGS });
    expect(s.settingsFile.setAsideAs).not.toBeNull();
    expect(readdirSync(folder).some((f) => f.startsWith('settings.json.damaged-'))).toBe(true);
    s.close();
  });

  it('keeps working when the database cannot be opened', async () => {
    mkdirSync(join(folder, 'hypersol.sqlite')); // a folder where the file should be
    const s = new StorageService(folder, cleaner);
    expect(s.available).toBe(false);
    expect(await s.handle({ op: 'status' })).toEqual({
      ok: true,
      value: { available: false, message: "Couldn't open your saved data" },
    });
    expect(await s.handle({ op: 'bookmarks.list' })).toEqual({ ok: false, error: "Couldn't open your saved data" });
    expect(s.recordVisit('https://a.example/', 'A')).toBeNull();
    expect(await s.handle({ op: 'settings.get' })).toMatchObject({ ok: true });
    s.close();
  });

  it('clears what was chosen, and tells listeners', async () => {
    const s = new StorageService(folder, cleaner);
    const changes: string[] = [];
    s.onChange((w) => changes.push(w));
    s.recordVisit('https://a.example/', 'A');
    await s.handle({ op: 'data.clear', history: true, cookies: true, cache: false });
    expect(await s.handle({ op: 'history.recent', limit: 5 })).toEqual({ ok: true, value: [] });
    expect(cleared).toEqual(['cookies']);
    expect(changes).toEqual(['history', 'history']);
    s.close();
  });

  it('refuses bad requests without throwing', async () => {
    const s = new StorageService(folder, cleaner);
    expect(await s.handle({ op: 'nope' })).toEqual({ ok: false, error: 'Unknown request: nope' });
    expect(await s.handle({ op: 'settings.set', patch: { searchEngine: 'x' } })).toMatchObject({ ok: false });
    s.close();
  });
});
