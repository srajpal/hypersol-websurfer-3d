import type { FilterStatus } from '../../shared/privacy';

/** resources/filters/lists.json: which lists, from where, and which may ship in the app. */
export interface ListManifest {
  base: string;
  lists: { path: string; name: string; license: string; ship: boolean }[];
  resources: { path: string; name: string; license: string; ship: boolean };
}

/** Files the service reads and writes; replaceable in tests. */
export interface FilterFiles {
  /** The saved copy from the last refresh, or null if there is none. May throw if unreadable. */
  readSaved(): { bin: Uint8Array; meta: string } | null;
  /** Writes the saved copy; each file swapped in whole. */
  writeSaved(bin: Uint8Array, meta: string): void;
  /** The starter copy included in the app, and when it was built. */
  readStarter(): { bin: Uint8Array; built: number };
}

export interface FilterDeps<E> {
  files: FilterFiles;
  /** Downloads one list as text. Rejects on failure. */
  download(url: string): Promise<string>;
  /** Builds the engine from list texts and the resources file, off the main thread. */
  build(lists: string[], resources: string): Promise<Uint8Array>;
  /** Loads an engine from its saved form. Throws if the data is damaged or from another version. */
  load(bin: Uint8Array): E;
  now(): number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
/** After a failed refresh, wait this long before trying again on schedule. */
export const RETRY_MS = 60 * 60 * 1000;

interface SavedMeta {
  updatedAt: number;
  /** The addresses the saved copy was built from; a changed list set makes it due at once. */
  urls: string[];
}

function plain(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The filter lists behind the privacy shield. On start it loads the copy
 * saved by the last refresh, or, if that is missing, damaged, or from an
 * older version of the blocker, the starter copy included in the app, so
 * pages are protected from the first one (TODO.md milestone 4, Q2 a).
 * A refresh downloads every list from its named address, builds the new
 * engine off the main thread, saves it, and only then puts it in use; any
 * failure keeps the lists in use.
 */
export class FilterService<E> {
  private current!: E;
  private source: FilterStatus['source'] = 'starter';
  private updatedAt = 0;
  private refreshing: Promise<FilterStatus> | null = null;
  private lastError: string | undefined;
  private lastAttemptAt: number | undefined;
  private problemText: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly manifest: ListManifest,
    private readonly deps: FilterDeps<E>,
    /** Where the lists are downloaded from (the manifest's base; a local server in tests). */
    private readonly base = manifest.base,
  ) {
    this.loadAtStart();
  }

  get engine(): E {
    return this.current;
  }

  /** Why the saved copy was not used at start, if it was not. */
  get problem(): string | null {
    return this.problemText;
  }

  /** Every address a refresh downloads, in order. */
  get urls(): string[] {
    return [...this.manifest.lists.map((l) => this.base + l.path), this.base + this.manifest.resources.path];
  }

  status(): FilterStatus {
    return {
      source: this.source,
      updatedAt: this.updatedAt,
      refreshing: this.refreshing !== null,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** True when a scheduled refresh should run: the lists are a day old and no attempt failed within the hour. */
  due(): boolean {
    const now = this.deps.now();
    if (this.refreshing) return false;
    if (now - this.updatedAt < DAY_MS) return false;
    return this.lastAttemptAt === undefined || now - this.lastAttemptAt >= RETRY_MS;
  }

  /** Downloads and builds the lists; one refresh at a time. Never rejects. */
  refresh(): Promise<FilterStatus> {
    if (this.refreshing) return this.refreshing;
    this.lastAttemptAt = this.deps.now();
    this.refreshing = this.run().finally(() => {
      this.refreshing = null;
      this.emit();
    });
    this.emit();
    return this.refreshing;
  }

  private async run(): Promise<FilterStatus> {
    try {
      const texts = await Promise.all(this.urls.map((url) => this.deps.download(url)));
      const resources = texts.pop()!;
      const bin = await this.deps.build(texts, resources);
      const engine = this.deps.load(bin);
      const updatedAt = this.deps.now();
      const meta: SavedMeta = { updatedAt, urls: this.urls };
      this.deps.files.writeSaved(bin, `${JSON.stringify(meta, null, 2)}\n`);
      this.current = engine;
      this.source = 'downloaded';
      this.updatedAt = updatedAt;
      this.lastError = undefined;
    } catch (e) {
      this.lastError = `Couldn't update the filter lists (${plain(e)}). The current lists are still in use.`;
    }
    return { ...this.status(), refreshing: false };
  }

  private loadAtStart(): void {
    try {
      const saved = this.deps.files.readSaved();
      if (saved) {
        const meta = JSON.parse(saved.meta) as Partial<SavedMeta>;
        if (typeof meta.updatedAt !== 'number' || !Array.isArray(meta.urls)) throw new Error('its details file is damaged');
        this.current = this.deps.load(saved.bin);
        this.source = 'downloaded';
        // Lists added or removed since: due for a refresh at once.
        this.updatedAt = meta.urls.join('\n') === this.urls.join('\n') ? meta.updatedAt : 0;
        return;
      }
    } catch (e) {
      this.problemText = `The saved filter lists couldn't be used (${plain(e)}), so the included lists are in use.`;
    }
    const starter = this.deps.files.readStarter();
    this.current = this.deps.load(starter.bin);
    this.source = 'starter';
    this.updatedAt = starter.built;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
