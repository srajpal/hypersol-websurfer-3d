/**
 * Progress screenshots (owner request, prompt 20): captures the main
 * screens of the built app into docs/screenshots/<milestone>/.
 *
 *   MILESTONE=m3 pnpm screenshots
 *
 * Uses Electron's own window capture: Playwright's screenshots can show a
 * page wider than it is. Pages are the local test fixtures, so no real
 * browsing data appears.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { startFixtureServer } from '../e2e/fixture-server';
import {
  clickCard,
  launch,
  navigateTo,
  pressInShell,
  settled,
  sleep,
  tabs,
  waitForPage,
  type Harness,
} from '../e2e/harness';

const milestone = process.env['MILESTONE'];
const outDir = fileURLToPath(new URL(`../../docs/screenshots/${milestone ?? 'unknown'}/`, import.meta.url));

async function capture(h: Harness, name: string): Promise<void> {
  await sleep(600); // let snapshots, favicons, and animations finish
  const png = await h.app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0]!.webContents.capturePage();
    return image.toPNG().toString('base64');
  });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(png, 'base64'));
}

it('captures the main screens', async () => {
  if (!milestone || !/^m\d+$/.test(milestone)) {
    throw new Error('Set MILESTONE, for example MILESTONE=m3 pnpm screenshots');
  }
  mkdirSync(outDir, { recursive: true });
  const server = await startFixtureServer();
  const h = await launch(server.url('link-a.html'), { searchUrl: `${server.base}search?q=%s` });
  try {
    await waitForPage(h, 'link-a');
    for (const page of ['form.html', 'long.html']) {
      await pressInShell(h, 'T', ['control']);
      await settled(h);
      await navigateTo(h, server.url(page));
      await waitForPage(h, page.replace('.html', ''));
    }
    await sleep(800);
    await clickCard(h, (await tabs(h))[0]!.id);
    await waitForPage(h, 'link-a');
    await capture(h, '1-tabs');

    await pressInShell(h, 'T', ['control']);
    await settled(h);
    await capture(h, '2-start-panel');

    await navigateTo(h, 'http://notfound.test/');
    await sleep(600);
    await capture(h, '3-error-card');
  } finally {
    await h.close();
    await server.close();
  }
}, 120_000);
