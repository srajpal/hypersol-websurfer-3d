import { DatabaseSync } from 'node:sqlite';
import type { Bookmark, HistoryEntry } from '../../shared/data';

/** Current schema; raise it and add a step to MIGRATIONS for any change. */
export const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE bookmarks (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      favicon TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE history (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      visited_at INTEGER NOT NULL
    );
    CREATE INDEX history_by_time ON history (visited_at DESC);
    CREATE INDEX history_by_url ON history (url);
  `,
};

interface BookmarkRow {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  created_at: number;
}

interface HistoryRow {
  id: number;
  url: string;
  title: string;
  visited_at: number;
}

const toBookmark = (r: BookmarkRow): Bookmark => ({
  id: r.id,
  url: r.url,
  title: r.title,
  favicon: r.favicon,
  createdAt: r.created_at,
});

const toEntry = (r: HistoryRow): HistoryEntry => ({
  id: r.id,
  url: r.url,
  title: r.title,
  visitedAt: r.visited_at,
});

/** Escapes LIKE wildcards so a search for "50%" finds "50%". */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Bookmarks and history in one SQLite file (hypersol.sqlite). */
export class Store {
  private readonly db: DatabaseSync;

  /** Opens (or creates) the database at path; ':memory:' for tests. Throws if it cannot. */
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  get schemaVersion(): number {
    return (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  }

  private migrate(): void {
    let version = this.schemaVersion;
    if (version > SCHEMA_VERSION) {
      throw new Error(`Saved data is from a newer version (schema ${version}); this version reads up to ${SCHEMA_VERSION}.`);
    }
    while (version < SCHEMA_VERSION) {
      version += 1;
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[version]!);
        this.db.exec(`PRAGMA user_version = ${version}`);
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }
  }

  // ---- Bookmarks ----------------------------------------------------------

  listBookmarks(): Bookmark[] {
    return (this.db.prepare('SELECT * FROM bookmarks ORDER BY created_at DESC, id DESC').all() as unknown as BookmarkRow[]).map(
      toBookmark,
    );
  }

  hasBookmark(url: string): boolean {
    return this.db.prepare('SELECT 1 FROM bookmarks WHERE url = ?').get(url) !== undefined;
  }

  /** Adds a bookmark, or updates its title and favicon if the address is already saved. */
  addBookmark(url: string, title: string, favicon: string | null, now = Date.now()): Bookmark {
    this.db
      .prepare(
        `INSERT INTO bookmarks (url, title, favicon, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (url) DO UPDATE SET title = excluded.title, favicon = COALESCE(excluded.favicon, favicon)`,
      )
      .run(url, title, favicon, now);
    return toBookmark(this.db.prepare('SELECT * FROM bookmarks WHERE url = ?').get(url) as unknown as BookmarkRow);
  }

  removeBookmark(url: string): void {
    this.db.prepare('DELETE FROM bookmarks WHERE url = ?').run(url);
  }

  // ---- History ------------------------------------------------------------

  /** Records one visit; returns its id. */
  recordVisit(url: string, title: string, now = Date.now()): number {
    const result = this.db.prepare('INSERT INTO history (url, title, visited_at) VALUES (?, ?, ?)').run(url, title, now);
    return Number(result.lastInsertRowid);
  }

  updateVisitTitle(id: number, title: string): void {
    this.db.prepare('UPDATE history SET title = ? WHERE id = ?').run(title, id);
  }

  /** Visits whose address or title contains the text, newest first. */
  searchHistory(query: string, limit: number): HistoryEntry[] {
    const text = query.trim();
    const rows =
      text === ''
        ? this.db.prepare('SELECT * FROM history ORDER BY visited_at DESC, id DESC LIMIT ?').all(limit)
        : this.db
            .prepare(
              `SELECT * FROM history WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
               ORDER BY visited_at DESC, id DESC LIMIT ?`,
            )
            .all(likePattern(text), likePattern(text), limit);
    return (rows as unknown as HistoryRow[]).map(toEntry);
  }

  /** The most recent visit to each address, newest first. */
  recentHistory(limit: number): HistoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT h.* FROM history h
         JOIN (SELECT url, MAX(id) AS id FROM history GROUP BY url) latest ON latest.id = h.id
         ORDER BY h.visited_at DESC, h.id DESC LIMIT ?`,
      )
      .all(limit);
    return (rows as unknown as HistoryRow[]).map(toEntry);
  }

  deleteVisit(id: number): void {
    this.db.prepare('DELETE FROM history WHERE id = ?').run(id);
  }

  clearHistory(): void {
    this.db.exec('DELETE FROM history');
  }

  close(): void {
    this.db.close();
  }
}
