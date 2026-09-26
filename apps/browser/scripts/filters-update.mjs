// Rebuilds the starter copy of the filter lists included in the app
// (TODO.md milestone 4, Q2 a). Run before each release with
// `pnpm filters:update`. Downloads every list in resources/filters/lists.json
// from its named address, prints each list's own license line so it can be
// checked against the manifest, and writes:
//   resources/filters/starter.bin   the blocker engine built from the lists
//                                   marked "ship" (download-only lists left out)
//   resources/filters/starter.json  what went in: addresses, sizes, hashes, date
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FiltersEngine } from '@ghostery/adblocker-electron';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'resources', 'filters');
const manifest = JSON.parse(readFileSync(join(dir, 'lists.json'), 'utf8'));

async function download(path) {
  const url = manifest.base + path;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  return { url, text, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') };
}

function licenseLines(text) {
  return text
    .split('\n', 60)
    .filter((line) => /licen[cs]e/i.test(line))
    .map((line) => line.trim());
}

function writeAtomic(path, data) {
  writeFileSync(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
}

const shipped = [];
const record = [];
for (const list of manifest.lists) {
  const got = await download(list.path);
  console.log(`${list.ship ? 'ship    ' : 'download'} ${list.name}: ${got.bytes} bytes`);
  const lines = licenseLines(got.text);
  console.log(`         license in file: ${lines.length ? lines.join(' | ') : '(none stated)'}`);
  if (list.ship) shipped.push(got.text);
  record.push({ name: list.name, url: got.url, license: list.license, shipped: list.ship, bytes: got.bytes, sha256: got.sha256 });
}

const resources = await download(manifest.resources.path);
console.log(`ship     ${manifest.resources.name}: ${resources.bytes} bytes`);

const engine = FiltersEngine.parse(shipped.join('\n'));
engine.updateResources(resources.text, resources.sha256);
const bin = engine.serialize();
writeAtomic(join(dir, 'starter.bin'), bin);
writeAtomic(
  join(dir, 'starter.json'),
  `${JSON.stringify(
    {
      built: new Date().toISOString(),
      engineBytes: bin.length,
      lists: record,
      resources: { name: manifest.resources.name, url: resources.url, license: manifest.resources.license, bytes: resources.bytes, sha256: resources.sha256 },
    },
    null,
    2,
  )}\n`,
);
console.log(`starter.bin: ${bin.length} bytes from ${shipped.length} lists`);
