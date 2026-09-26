/**
 * Wording and arithmetic for the instrument panel (milestone 7), kept
 * apart from the components so it can be unit tested.
 */
import type { ConsoleEntry, NetEntry } from '../shared/inspect';
import type { ConsoleFilter } from '../shared/settings';

export function formatBytes(bytes: number): string {
  if (bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatMs(ms: number): string {
  if (ms < 0) return '…';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** 3725 -> "1:02:05"; 65 -> "1:05". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** How old something is, in words: "today", "1 day", "12 days". */
export function formatAge(thenMs: number, nowMs: number): string {
  const days = Math.floor((nowMs - thenMs) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

/** A value's share of a dial or meter, 0 to 1. */
export function fraction(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value / max));
}

export function levelShown(filter: ConsoleFilter, level: ConsoleEntry['level']): boolean {
  if (filter === 'errors') return level === 'error';
  if (filter === 'warnings') return level === 'error' || level === 'warning';
  return true;
}

export type NetKind = 'all' | 'doc' | 'script' | 'style' | 'image' | 'xhr' | 'other';

export function netKind(type: string): Exclude<NetKind, 'all'> {
  switch (type) {
    case 'mainFrame':
    case 'subFrame':
      return 'doc';
    case 'script':
      return 'script';
    case 'stylesheet':
    case 'font':
      return 'style';
    case 'image':
    case 'media':
      return 'image';
    case 'xhr':
    case 'webSocket':
      return 'xhr';
    default:
      return 'other';
  }
}

export function filterNet(entries: readonly NetEntry[], kind: NetKind, text: string): NetEntry[] {
  const q = text.trim().toLowerCase();
  return entries.filter((e) => (kind === 'all' || netKind(e.type) === kind) && (q === '' || e.url.toLowerCase().includes(q)));
}

/** What the status column says: the code, BLOCKED, the error's short name, or … while waiting. */
export function netStatus(e: NetEntry): string {
  if (e.blocked) return 'BLOCKED';
  if (e.error) return e.error.replace(/^net::ERR_/, '').slice(0, 14);
  if (e.status > 0) return String(e.status);
  return '…';
}

/** Merges updated requests into the list by their number, keeping the latest `max`. */
export function mergeNet(list: readonly NetEntry[], updates: readonly NetEntry[], max: number): NetEntry[] {
  const bySeq = new Map(list.map((e) => [e.seq, e]));
  for (const u of updates) bySeq.set(u.seq, u);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-max);
}

/** The last part of an address, for the name column. */
export function shortName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? `${last}${u.search}` : u.host;
  } catch {
    return url;
  }
}
