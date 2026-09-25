import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export interface FixtureServer {
  /** Base address, ending in a slash, e.g. http://127.0.0.1:53211/ */
  base: string;
  url(file: string): string;
  close(): Promise<void>;
}

/** Serves tests/fixtures on 127.0.0.1 at a random free port. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
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
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/`;
  return {
    base,
    url: (file) => base + file,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Drop keep-alive sockets so no later request can still be served.
        server.closeAllConnections();
      }),
  };
}
