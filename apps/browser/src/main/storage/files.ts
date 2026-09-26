import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/**
 * Writes a file through a temporary copy that is then renamed over the
 * original, so a crash mid-write never leaves half a file.
 */
export function writeFileAtomic(path: string, data: string | Uint8Array): void {
  const temp = `${path}.tmp`;
  writeFileSync(temp, data);
  renameSync(temp, path);
}

/** The file's text, or null if it does not exist. */
export function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Moves a damaged file aside, keeping it for inspection. Returns the new name. */
export function setAside(path: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = `${path}.damaged-${stamp}`;
  renameSync(path, target);
  return target;
}
