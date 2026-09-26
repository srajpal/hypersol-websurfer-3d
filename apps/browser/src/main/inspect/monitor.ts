import {
  MAX_BATCH,
  MAX_ENTRIES,
  type CertInfo,
  type ConsoleEntry,
  type ConsoleLevel,
  type NetEntry,
  type PageReadout,
} from '../../shared/inspect';

interface TabRecord {
  url: string;
  /** Counts page loads: the shell starts its lists afresh when it changes. */
  page: number;
  startedAt: number;
  finishedAt: number;
  net: NetEntry[];
  /** Requests still waiting, by Chromium's request id. */
  waiting: Map<number, { entry: NetEntry; at: number }>;
  console: ConsoleEntry[];
  netSeq: number;
  netRev: number;
  consoleSeq: number;
  totals: { requests: number; bytes: number; blocked: number; failed: number };
}

const BLOCKED = 'net::ERR_BLOCKED_BY_CLIENT';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** A response's declared size, or -1. */
export function declaredBytes(headers: Record<string, string[]> | undefined): number {
  if (!headers) return -1;
  for (const [name, values] of Object.entries(headers)) {
    if (name.toLowerCase() === 'content-length') {
      const n = Number(values[0]);
      return Number.isFinite(n) && n >= 0 ? n : -1;
    }
  }
  return -1;
}

/**
 * What the instrument panel shows about each tab's page (milestone 7):
 * its requests, console messages, and load time, from events the main
 * process already sees. No Electron imports, so it can be unit tested.
 * In memory only, capped, and forgotten when the tab closes.
 */
export class PageMonitor {
  private readonly tabs = new Map<number, TabRecord>();
  private readonly certs = new Map<string, CertInfo>();

  /** A tab starts loading a page (its main-frame request). */
  pageStart(tab: number, url: string, at: number): void {
    const old = this.tabs.get(tab);
    this.tabs.set(tab, {
      url,
      page: (old?.page ?? 0) + 1,
      startedAt: at,
      finishedAt: -1,
      net: [],
      waiting: new Map(),
      console: [],
      netSeq: old?.netSeq ?? 0,
      netRev: old?.netRev ?? 0,
      consoleSeq: old?.consoleSeq ?? 0,
      totals: { requests: 0, bytes: 0, blocked: 0, failed: 0 },
    });
  }

  pageFinished(tab: number, at: number): void {
    const r = this.tabs.get(tab);
    if (r && r.finishedAt < 0) r.finishedAt = at;
  }

  request(tab: number, id: number, url: string, type: string, method: string, at: number): void {
    if (type === 'mainFrame') this.pageStart(tab, url, at);
    const r = this.tabs.get(tab);
    if (!r) return;
    r.netSeq += 1;
    r.netRev += 1;
    const entry: NetEntry = { seq: r.netSeq, rev: r.netRev, url, type, method, status: 0, bytes: -1, fromCache: false, ms: -1, blocked: false, error: '' };
    r.net.push(entry);
    if (r.net.length > MAX_ENTRIES) r.net.shift();
    r.waiting.set(id, { entry, at });
    r.totals.requests += 1;
  }

  completed(tab: number, id: number, status: number, bytes: number, fromCache: boolean, at: number): void {
    const r = this.tabs.get(tab);
    const w = r?.waiting.get(id);
    if (!r || !w) return;
    r.waiting.delete(id);
    r.netRev += 1;
    Object.assign(w.entry, { status, bytes, fromCache, ms: Math.max(0, Math.round(at - w.at)), rev: r.netRev });
    if (bytes > 0) r.totals.bytes += bytes;
  }

  failed(tab: number, id: number, error: string, at: number): void {
    const r = this.tabs.get(tab);
    const w = r?.waiting.get(id);
    if (!r || !w) return;
    r.waiting.delete(id);
    const blocked = error === BLOCKED;
    r.netRev += 1;
    Object.assign(w.entry, { error, blocked, ms: Math.max(0, Math.round(at - w.at)), rev: r.netRev });
    if (blocked) r.totals.blocked += 1;
    else r.totals.failed += 1;
  }

  console(tab: number, level: ConsoleLevel, message: string, source: string, line: number, at: number): void {
    const r = this.tabs.get(tab);
    if (!r) return;
    r.consoleSeq += 1;
    r.console.push({ seq: r.consoleSeq, level, message: message.slice(0, 2000), source: source.slice(0, 500), line, at });
    if (r.console.length > MAX_ENTRIES) r.console.shift();
  }

  clearConsole(tab: number): void {
    const r = this.tabs.get(tab);
    if (r) r.console = [];
  }

  /** Records the certificate Chromium checked for a host (the verdict itself is left to Chromium). */
  certificate(info: CertInfo): void {
    this.certs.set(info.host.toLowerCase(), info);
    if (this.certs.size > 500) this.certs.delete(this.certs.keys().next().value!);
  }

  forget(tab: number): void {
    this.tabs.delete(tab);
  }

  /** The page's readout and what changed since the given numbers; `pageNumber` tells the shell when to start afresh. */
  snapshot(tab: number, sinceNet: number, sinceConsole: number): {
    page: Omit<PageReadout, 'cpuPercent' | 'memoryKB'>;
    pageNumber: number;
    net: NetEntry[];
    console: ConsoleEntry[];
  } {
    const r = this.tabs.get(tab);
    if (!r) {
      return {
        page: { url: '', secure: false, loadMs: -1, requests: 0, bytes: 0, blocked: 0, failed: 0, cert: null },
        pageNumber: 0,
        net: [],
        console: [],
      };
    }
    const secure = r.url.startsWith('https:');
    return {
      page: {
        url: r.url,
        secure,
        loadMs: r.finishedAt < 0 ? -1 : Math.round(r.finishedAt - r.startedAt),
        ...r.totals,
        cert: secure ? (this.certs.get(hostOf(r.url)) ?? null) : null,
      },
      pageNumber: r.page,
      // Oldest changes first, so a long list arrives over a few snapshots.
      net: r.net.filter((e) => e.rev > sinceNet).sort((a, b) => a.rev - b.rev).slice(0, MAX_BATCH),
      console: r.console.filter((e) => e.seq > sinceConsole).slice(0, MAX_BATCH),
    };
  }
}
