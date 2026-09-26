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
  waitFor,
  waitForPage,
  type Harness,
} from '../e2e/harness';

const STAR = 'hs-toolbar [data-testid="star"]';
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
    // Bookmark this page, so the star, start panel, and Library have data.
    await waitFor('star ready', () => h.shell.locator(STAR).isDisabled(), (d) => !d);
    await h.shell.click(STAR);
    await waitFor('bookmarked', () => h.shell.locator(STAR).getAttribute('aria-pressed'), (p) => p === 'true');
    await capture(h, '1-tabs');

    await pressInShell(h, 'T', ['control']);
    await settled(h);
    await capture(h, '2-start-panel');

    await navigateTo(h, 'http://notfound.test/');
    await sleep(600);
    await capture(h, '3-error-card');

    await pressInShell(h, 'O', ['control', 'shift']);
    await h.shell.click('hs-library [data-testid="lib-tab-history"]');
    await capture(h, '4-library-history');
    await pressInShell(h, ',', ['control']);
    await capture(h, '5-settings');
    // Scroll the Settings panel to its privacy part (milestone 4).
    await h.shell.evaluate(() => {
      const body = document.querySelector('hs-settings')?.shadowRoot?.querySelector('.body');
      body?.querySelector('[data-testid="set-dns-secure"]')?.scrollIntoView({ block: 'start' });
    });
    await capture(h, '6-settings-privacy');
    await pressInShell(h, 'Escape');

    // The privacy shield (milestone 4): a page with a tracker and an ad, on a named test host.
    await navigateTo(h, server.url('shield.html').replace('127.0.0.1', 'shop.test'));
    await waitForPage(h, 'shield.html');
    await waitFor('shield count', () => h.shell.evaluate(() => (document.querySelector('hs-shield') as (Element & { count?: number }) | null)?.count ?? 0), (n) => n > 0);
    await h.shell.click('hs-shield [data-testid="shield"]');
    await capture(h, '7-shield-popover');
    await pressInShell(h, 'Escape');
    await navigateTo(h, server.url('ddm/clk/landing').replace('127.0.0.1', 'ad.doubleclick.net'));
    await sleep(600);
    await capture(h, '8-blocked-card');

    // The layers view (milestone 5): a page broken apart into layers, then flat.
    await navigateTo(h, server.url('layers.html'));
    await waitForPage(h, 'layers.html');
    await sleep(800);
    await capture(h, '9-layers-view');
    await pressInShell(h, 'L', ['control', 'shift']);
    await sleep(600);
    await capture(h, '10-layers-off');
    await pressInShell(h, 'L', ['control', 'shift']);
    await pressInShell(h, ',', ['control']);
    await h.shell.evaluate(() => {
      const body = document.querySelector('hs-settings')?.shadowRoot?.querySelector('.body');
      body?.querySelector('[data-testid="set-layers-on-open"]')?.scrollIntoView({ block: 'start' });
    });
    await capture(h, '11-settings-layers');
    await pressInShell(h, 'Escape');

    // Daylight (milestone 6): the same screens in the light theme.
    await h.shell.click('hs-theme-button [data-testid="theme"]');
    await waitFor('Daylight', () => h.shell.evaluate(() => document.documentElement.style.colorScheme), (s) => s === 'light');
    await sleep(400);
    await capture(h, '12-daylight-layers');
    await navigateTo(h, server.url('link-a.html'));
    await waitForPage(h, 'link-a');
    await capture(h, '13-daylight-tabs');
    await pressInShell(h, ',', ['control']);
    await capture(h, '14-daylight-settings');
    await pressInShell(h, 'Escape');
    await navigateTo(h, server.url('shield.html').replace('127.0.0.1', 'shop.test'));
    await waitForPage(h, 'shield.html');
    await h.shell.click('hs-shield [data-testid="shield"]');
    await capture(h, '15-daylight-shield');
    await pressInShell(h, 'Escape');

    // The instrument panel (milestone 7), in Daylight and then Nebula.
    await navigateTo(h, server.url('inspect.html'));
    await waitForPage(h, 'inspect.html');
    await pressInShell(h, 'L', ['control', 'shift']); // flat page, to see the readouts beside it
    await pressInShell(h, 'I', ['control', 'shift']);
    await sleep(2500);
    await capture(h, '16-daylight-instruments');
    await h.shell.click('hs-theme-button [data-testid="theme"]');
    await sleep(1500);
    await capture(h, '17-nebula-instruments');
    await pressInShell(h, ',', ['control']);
    await h.shell.evaluate(() => {
      const body = document.querySelector('hs-settings')?.shadowRoot?.querySelector('.body');
      body?.querySelector('[data-testid="set-instruments"]')?.scrollIntoView({ block: 'start' });
    });
    await capture(h, '18-settings-instruments');
  } finally {
    await h.close();
    await server.close();
  }
}, 120_000);
