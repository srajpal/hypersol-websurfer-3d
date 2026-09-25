import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** A solid-colour 16×16 PNG, built here so the fixture has no binary file. */
function makePng(r: number, g: number, b: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const size = 16;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICON_PNG = makePng(0x30, 0x50, 0xc0);

export interface FixtureServer {
  /** Base address, ending in a slash, e.g. http://127.0.0.1:53211/ */
  base: string;
  url(file: string): string;
  close(): Promise<void>;
  /** Requests received, by path and query (for example "/icon.png?v=3"). */
  hits: Map<string, number>;
  /** Requests the client cancelled before the answer was sent, by path and query. */
  aborted: Map<string, number>;
}

/** A PNG header claiming a size, for the favicon dimension limit (not decodable). */
function pngClaiming(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>${escapeHtml(title)}</title>
<style>body{margin:0;padding:40px;font-family:sans-serif;font-size:22px;background:#fff}</style></head>
<body>${body}</body></html>`;
}

/**
 * Serves tests/fixtures, plus these routes:
 *   /slow?ms=1500              answers after a delay (loading strip)
 *   /search?q=...              a local stand-in for the search engine
 *   /icon.png                  a favicon
 *   /favicon/huge-bytes.png    2 MB, with its length declared
 *   /favicon/huge-stream.png   2 MB, sent in pieces without a declared length
 *   /favicon/huge-dims.png     a tiny file claiming 20000x20000 pixels
 *   /favicon/slow.png?ms=...   answers late (favicon timeout and cancelling)
 */
function handler(req: IncomingMessage, res: ServerResponse, hits: Map<string, number>, aborted: Map<string, number>): void {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = decodeURIComponent(url.pathname);
  const key = `${url.pathname}${url.search}`;
  hits.set(key, (hits.get(key) ?? 0) + 1);
  res.on('close', () => {
    if (!res.writableFinished) aborted.set(key, (aborted.get(key) ?? 0) + 1);
  });
  if (path === '/favicon/huge-bytes.png') {
    const body = Buffer.concat([ICON_PNG, Buffer.alloc(2 * 1024 * 1024)]);
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(body.length), 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  if (path === '/favicon/huge-stream.png') {
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    let sent = 0;
    const piece = Buffer.alloc(64 * 1024);
    const pump = () => {
      while (sent < 2 * 1024 * 1024 && !res.destroyed) {
        sent += piece.length;
        if (!res.write(piece)) return void res.once('drain', pump);
      }
      if (!res.destroyed) res.end();
    };
    pump();
    return;
  }
  if (path === '/favicon/huge-dims.png') {
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    res.end(pngClaiming(20000, 20000));
    return;
  }
  if (path === '/favicon/slow.png') {
    const ms = Math.min(30_000, Number(url.searchParams.get('ms') ?? '10000'));
    const t = setTimeout(() => {
      if (!res.destroyed) {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        res.end(ICON_PNG);
      }
    }, ms);
    res.on('close', () => clearTimeout(t));
    return;
  }
  if (path === '/slow') {
    const ms = Math.min(10_000, Number(url.searchParams.get('ms') ?? '1500'));
    setTimeout(() => {
      res.writeHead(200, { 'content-type': TYPES['.html']!, 'cache-control': 'no-store' });
      res.end(page('Slow page', '<h1>Slow page</h1><p>This answered late on purpose.</p>'));
    }, ms);
    return;
  }
  if (path === '/search') {
    const q = url.searchParams.get('q') ?? '';
    res.writeHead(200, { 'content-type': TYPES['.html']!, 'cache-control': 'no-store' });
    res.end(page(`Search: ${q}`, `<h1>Results for <span id="query">${escapeHtml(q)}</span></h1>`));
    return;
  }
  if (path === '/icon.png') {
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    res.end(ICON_PNG);
    return;
  }
  const file = normalize(join(FIXTURES_DIR, path));
  if (!file.startsWith(normalize(FIXTURES_DIR)) || file.endsWith(sep) || !TYPES[extname(file)]) {
    res.writeHead(404).end();
    return;
  }
  readFile(file).then(
    (body) => {
      res.writeHead(200, { 'content-type': TYPES[extname(file)]!, 'cache-control': 'no-store' });
      res.end(body);
    },
    () => res.writeHead(404).end(),
  );
}

async function listen(
  server: Server,
  scheme: 'http' | 'https',
  counters: { hits: Map<string, number>; aborted: Map<string, number> },
  cleanup?: () => void,
  requestedPort = 0,
): Promise<FixtureServer> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const base = `${scheme}://127.0.0.1:${port}/`;
  return {
    base,
    ...counters,
    url: (file) => base + file,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          cleanup?.();
          resolve();
        });
        // Drop keep-alive sockets so no later request can still be served.
        server.closeAllConnections();
      }),
  };
}

/** Serves the fixtures on 127.0.0.1, at a random free port unless one is given. */
function counters() {
  return { hits: new Map<string, number>(), aborted: new Map<string, number>() };
}

export function startFixtureServer(port = 0): Promise<FixtureServer> {
  const c = counters();
  return listen(createServer((req, res) => handler(req, res, c.hits, c.aborted)), 'http', c, undefined, port);
}

function findOpenssl(): string {
  const candidates = [
    'openssl',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ['version'], { stdio: 'ignore' });
      return c;
    } catch {
      // Next one.
    }
  }
  throw new Error('The certificate-error check needs openssl on PATH (Git for Windows includes one).');
}

/**
 * Serves the fixtures over HTTPS with a self-signed certificate made for
 * this run and deleted afterwards. Chromium does not trust it, which is
 * the point: it produces a certificate error.
 */
export function startHttpsFixtureServer(): Promise<FixtureServer> {
  const dir = mkdtempSync(join(tmpdir(), 'hypersol-tls-'));
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  execFileSync(
    findOpenssl(),
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1'],
    { stdio: 'ignore' },
  );
  if (!existsSync(cert)) throw new Error('openssl did not produce a certificate');
  const c = counters();
  const server = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) =>
    handler(req, res, c.hits, c.aborted),
  );
  return listen(server as unknown as Server, 'https', c, () => rmSync(dir, { recursive: true, force: true }));
}
