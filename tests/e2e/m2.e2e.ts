/**
 * Milestone 2 end-to-end checks D1 to D11 (TODO.md): tabs, top bar,
 * shortcuts, start panel, new-window rules, loading, error cards, and the
 * right-click menu. Every host except 127.0.0.1 is blocked for the run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, startHttpsFixtureServer, type FixtureServer } from './fixture-server';
import {
  ADDRESS,
  clickAt,
  clickCard,
  focusedPage,
  focusedTab,
  inPage,
  launch,
  navigateTo,
  pressInPage,
  pressInShell,
  screenPointOf,
  settled,
  shellCall,
  sleep,
  tabs,
  typeInPage,
  waitFor,
  waitForPage,
  type Harness,
} from './harness';

let server: FixtureServer;
const searchUrl = () => `${server.base}search?q=%s`;

beforeAll(async () => {
  server = await startFixtureServer();
});

afterAll(async () => {
  await server?.close();
});

/** The focused tab's panel and the parts inside it. */
const FOCUSED = '[data-testid="page-panel"][aria-hidden="false"]';
const OVERLAY = `${FOCUSED} [data-testid="page-overlay"]`;
const bar = (id: string) => `hs-toolbar [data-testid="${id}"]`;

async function tabCount(h: Harness, n: number): Promise<void> {
  await waitFor(`${n} tabs`, () => tabs(h), (t) => t.length === n);
}

async function focusedWhere(h: Harness, what: string, ok: (t: Awaited<ReturnType<typeof focusedTab>>) => boolean) {
  return waitFor(what, () => focusedTab(h), ok);
}

/** Tells whether the shell's keyboard focus is in the address field. */
function addressHasFocus(h: Harness): Promise<boolean> {
  return h.shell.evaluate(() => {
    const bar = document.querySelector('hs-toolbar');
    return document.activeElement === bar && bar?.shadowRoot?.activeElement?.getAttribute('data-testid') === 'address';
  });
}

describe('D1 top bar', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'), { searchUrl: searchUrl() });
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('shows the address, and back and forward start disabled', async () => {
    expect(await h.shell.inputValue(ADDRESS)).toBe(server.url('link-a.html'));
    expect(await h.shell.locator(bar('back')).isDisabled()).toBe(true);
    expect(await h.shell.locator(bar('forward')).isDisabled()).toBe(true);
    expect(await h.shell.locator(bar('reload')).isDisabled()).toBe(false);
  });

  it('loads a typed address', async () => {
    await navigateTo(h, server.url('link-b.html'));
    await waitForPage(h, 'link-b');
    await waitFor('address to update', () => h.shell.inputValue(ADDRESS), (v) => v === server.url('link-b.html'));
  });

  it('goes back and forward with the buttons', async () => {
    await waitFor('back to enable', () => h.shell.locator(bar('back')).isDisabled(), (d) => !d);
    await h.shell.click(bar('back'));
    await focusedWhere(h, 'back to page A', (t) => t.url.endsWith('link-a.html') && t.state === 'loaded');
    await waitFor('forward to enable', () => h.shell.locator(bar('forward')).isDisabled(), (d) => !d);
    await h.shell.click(bar('forward'));
    await focusedWhere(h, 'forward to page B', (t) => t.url.endsWith('link-b.html') && t.state === 'loaded');
  });

  it('reloads with the button', async () => {
    const page = await focusedPage(h);
    await inPage(h, 'window.__marker = 42', page);
    await h.shell.click(bar('reload'));
    await waitFor('reload', () => inPage(h, 'window.__marker ?? null', page), (m) => m === null);
  });

  it('searches for words that are not an address', async () => {
    await navigateTo(h, 'hello 3d world');
    await waitForPage(h, '/search');
    expect(await inPage<string>(h, 'document.getElementById("query").textContent', '/search')).toBe('hello 3d world');
    expect((await focusedTab(h)).url).toBe(`${server.base}search?q=hello%203d%20world`);
  });
});

describe('D2 tabs', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'), { searchUrl: searchUrl() });
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('the "+" card opens a start tab with the address field ready', async () => {
    await clickCard(h, 'plus');
    await tabCount(h, 2);
    const tab = await focusedTab(h);
    expect(tab.state).toBe('start');
    expect(await h.shell.locator(`${FOCUSED} [data-testid="start-panel"]`).isVisible()).toBe(true);
    await waitFor('address focus', () => addressHasFocus(h), (f) => f);
    expect(await h.shell.inputValue(ADDRESS)).toBe('');
  });

  it('switching tabs keeps each page as it was, without reloading', async () => {
    await navigateTo(h, server.url('form.html'));
    await waitForPage(h, 'form');
    const formPage = await focusedPage(h);
    const p = await screenPointOf(h, '#name', formPage);
    await clickAt(h, p);
    await waitFor('field focus', () => inPage(h, 'document.activeElement.id', formPage), (id) => id === 'name');
    await typeInPage(h, 'kept', formPage);
    await inPage(h, 'window.__marker = 7', formPage);

    const [first] = await tabs(h);
    await clickCard(h, first!.id);
    await focusedWhere(h, 'page A focused', (t) => t.id === first!.id);
    await settled(h);
    expect(await h.shell.inputValue(ADDRESS)).toBe(server.url('link-a.html'));

    await pressInShell(h, 'Tab', ['control']);
    await focusedWhere(h, 'form tab focused', (t) => t.url.endsWith('form.html'));
    await settled(h);
    expect(await inPage(h, 'window.__marker', formPage)).toBe(7);
    expect(await inPage(h, 'document.getElementById("name").value', formPage)).toBe('kept');
  });

  it('Ctrl+T, Ctrl+Tab, Ctrl+Shift+Tab, and Ctrl+W work from the shell', async () => {
    await pressInShell(h, 'T', ['control']);
    await tabCount(h, 3);
    expect((await focusedTab(h)).state).toBe('start');
    await pressInShell(h, 'Tab', ['control']);
    await focusedWhere(h, 'wrap to first tab', (t) => t.url.endsWith('link-a.html'));
    await pressInShell(h, 'Tab', ['control', 'shift']);
    await focusedWhere(h, 'back to the start tab', (t) => t.state === 'start');
    await pressInShell(h, 'W', ['control']);
    await tabCount(h, 2);
    await focusedWhere(h, 'form tab after close', (t) => t.url.endsWith('form.html'));
  });

  it("closes a tab with its card's close button", async () => {
    const [first] = await tabs(h);
    await clickCard(h, first!.id, 'close');
    await tabCount(h, 1);
    expect((await tabs(h))[0]!.url).toContain('form.html');
  });

  it('closing the last tab leaves a start tab', async () => {
    const before = (await tabs(h))[0]!.id;
    await clickCard(h, before, 'close');
    await waitFor('a fresh start tab', () => tabs(h), (t) => t.length === 1 && t[0]!.id !== before);
    expect((await focusedTab(h)).state).toBe('start');
  });
});

describe('D3 snapshots and favicons', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'), { searchUrl: searchUrl() });
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('shows the page on its card and the favicon, then stops drawing', async () => {
    await waitFor('favicon', () => focusedTab(h), (t) => t.hasFavicon);
    await clickCard(h, 'plus');
    await navigateTo(h, server.url('long.html'));
    await waitForPage(h, 'long');
    const all = await waitFor('snapshots on both cards', () => tabs(h), (t) => t.every((x) => x.hasSnapshot));
    expect(all).toHaveLength(2);
    // Spinners have stopped: nothing is drawn while idle.
    await sleep(800);
    const before = await shellCall(h, 'frames');
    await sleep(1500);
    expect(await shellCall(h, 'frames')).toBe(before);
  });
});

describe('D4 many tabs', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('scrolls the arc and keeps cards at full size', async () => {
    await clickCard(h, 'plus');
    await tabCount(h, 2);
    await settled(h);
    const [a, b] = await tabs(h);
    const pa = (await shellCall(h, 'cardPoint', a!.id, 'body'))!;
    const pb = (await shellCall(h, 'cardPoint', b!.id, 'body'))!;
    const spacing = Math.hypot(pb.x - pa.x, pb.y - pa.y);

    for (let i = 0; i < 10; i++) await pressInShell(h, 'T', ['control']);
    await tabCount(h, 12);
    await settled(h);
    const rail = await shellCall(h, 'rail');
    expect(rail.maxScroll).toBeGreaterThan(0);
    expect(rail.scroll).toBeGreaterThan(0); // scrolled down to the newest (focused) tab
    const focused = await focusedTab(h);
    expect(await shellCall(h, 'cardPoint', focused.id, 'body')).not.toBeNull();
    expect(await shellCall(h, 'cardPoint', 'plus', 'body')).not.toBeNull(); // "+" pinned in view

    // Wheel up over the rail brings the first cards back.
    const inRail = (await shellCall(h, 'cardPoint', focused.id, 'body'))!;
    await h.shell.mouse.move(inRail.x, inRail.y);
    for (let i = 0; i < 20; i++) await h.shell.mouse.wheel(0, -400);
    await waitFor('rail at the top', () => shellCall(h, 'rail'), (r) => r.scroll === 0);
    const all = await tabs(h);
    const qa = (await shellCall(h, 'cardPoint', all[0]!.id, 'body'))!;
    const qb = (await shellCall(h, 'cardPoint', all[1]!.id, 'body'))!;
    expect(Math.abs(Math.hypot(qb.x - qa.x, qb.y - qa.y) - spacing)).toBeLessThan(1.5);
    expect(await shellCall(h, 'cardPoint', all[11]!.id, 'body')).toBeNull(); // scrolled out of view
    expect(await shellCall(h, 'cardPoint', 'plus', 'body')).not.toBeNull(); // still in view at the top
    await clickCard(h, 'plus');
    await tabCount(h, 13);
  });
});

describe('D5 new-window links', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('new-window.html'));
    await waitForPage(h, 'new-window');
  });
  afterAll(async () => h?.close());

  it('blocks a pop-up nobody clicked for', async () => {
    const blocked = await waitFor(
      'the unrequested pop-up to be blocked',
      () => h.app.evaluate(() => (globalThis as unknown as MainLog).__hypersolTest.blockedPopups),
      (b) => b.some((u) => u.includes('from=auto')),
    );
    expect(blocked.some((u) => u.includes('from=auto'))).toBe(true);
    expect(await tabs(h)).toHaveLength(1);
  });

  it('opens target=_blank links in a new tab in front', async () => {
    const p = await screenPointOf(h, '#blank', 'new-window');
    await clickAt(h, p);
    await focusedWhere(h, 'the new tab in front', (t) => t.url.includes('from=blank'));
    expect(await tabs(h)).toHaveLength(2);
  });

  it('opens Ctrl-clicked links behind, next to their page', async () => {
    const [opener] = await tabs(h);
    await clickCard(h, opener!.id);
    await focusedWhere(h, 'opener focused', (t) => t.id === opener!.id);
    await waitForPage(h, 'new-window');
    const p = await screenPointOf(h, '#plain', 'new-window');
    await h.shell.keyboard.down('Control');
    await clickAt(h, p);
    await h.shell.keyboard.up('Control');
    await tabCount(h, 3);
    const all = await tabs(h);
    expect(all[1]!.url).toContain('from=plain'); // right after its opener
    expect((await focusedTab(h)).id).toBe(opener!.id); // focus stays
  });

  it('opens window.open from a click in front', async () => {
    const p = await screenPointOf(h, '#open', 'new-window');
    await clickAt(h, p);
    await focusedWhere(h, 'the clicked pop-up in front', (t) => t.url.includes('from=click'));
  });
});

describe('D6 loading', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch('', { searchUrl: searchUrl() });
  });
  afterAll(async () => h?.close());

  it('shows the loading strip and the shimmer while a page loads', async () => {
    await navigateTo(h, server.url('slow?ms=2500'));
    await waitFor(
      'loading strip',
      () => h.shell.locator(bar('progress')).getAttribute('data-state'),
      (s) => s === 'loading',
      2000,
    );
    expect(await h.shell.locator(`${FOCUSED} .hs-shimmer`).isVisible()).toBe(true);
    await waitForPage(h, '/slow');
    await waitFor('strip to finish', () => h.shell.locator(bar('progress')).getAttribute('data-state'), (s) => s === 'idle');
    expect(await h.shell.locator(`${FOCUSED} .hs-shimmer`).isVisible()).toBe(false);
  });
});

describe('D7 error cards', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch('', { searchUrl: searchUrl() });
  });
  afterAll(async () => h?.close());

  async function card(): Promise<string> {
    return (await h.shell.locator(OVERLAY).textContent()) ?? '';
  }

  it('address not found', async () => {
    await navigateTo(h, 'http://notfound.test/');
    await waitFor('not-found card', card, (t) => t.includes("We couldn't find that site"));
    expect(await card()).toContain('http://notfound.test/');
    expect(await h.shell.locator(`${OVERLAY} #panel-reload`).isVisible()).toBe(true);
  });

  it('connection failed, and Retry recovers once the site is back', async () => {
    const temp = await startFixtureServer();
    const port = Number(new URL(temp.base).port);
    const target = temp.url('link-b.html');
    await temp.close();
    await navigateTo(h, target);
    await waitFor('connection card', card, (t) => t.includes("Couldn't connect"));
    expect(await card()).toContain(target);
    const back = await startFixtureServer(port);
    try {
      await h.shell.locator(`${OVERLAY} #panel-reload`).click();
      await focusedWhere(h, 'page B after retry', (t) => t.state === 'loaded' && t.url === target);
      expect(await h.shell.locator(OVERLAY).isVisible()).toBe(false);
    } finally {
      await back.close();
    }
  });

  it('certificate error, with no way to proceed', async () => {
    const tls = await startHttpsFixtureServer();
    try {
      await navigateTo(h, tls.url('link-a.html'));
      await waitFor('certificate card', card, (t) => t.includes("This site's certificate isn't valid"));
      expect(await card()).toContain(tls.url('link-a.html'));
      expect(await h.shell.locator(`${OVERLAY} #panel-reload`).count()).toBe(0);
      expect(await h.shell.locator(`${OVERLAY} #panel-back`).isVisible()).toBe(true);
      expect((await focusedTab(h)).state).toBe('failed');
    } finally {
      await tls.close();
    }
  });
});

describe('D8 right-click menu', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  async function rightClick(selector: string, page = 'link-a'): Promise<string[]> {
    const count = await h.app.evaluate(() => (globalThis as unknown as MainLog).__hypersolTest.menus.length);
    const p = await screenPointOf(h, selector, page);
    await clickAt(h, p, { button: 'right' });
    const menus = await waitFor(
      'a right-click menu',
      () => h.app.evaluate(() => (globalThis as unknown as MainLog).__hypersolTest.menus.map((m) => m.labels)),
      (m) => m.length > count,
    );
    return menus[menus.length - 1]!;
  }

  function choose(label: string): Promise<void> {
    return h.app.evaluate((_electron, label) => {
      const log = (globalThis as unknown as MainLog).__hypersolTest;
      log.menus[log.menus.length - 1]!.run(label);
    }, label);
  }

  it('offers back, forward, and reload on the page', async () => {
    expect(await rightClick('h1')).toEqual(['Back', 'Forward', 'Reload']);
  });

  it('copies a link address', async () => {
    expect(await rightClick('#go')).toEqual(['Open link in new tab', 'Copy link address']);
    await choose('Copy link address');
    expect(await h.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(server.url('link-b.html'));
  });

  it('opens a link in a new tab behind', async () => {
    await rightClick('#go');
    await choose('Open link in new tab');
    await tabCount(h, 2);
    expect((await tabs(h))[1]!.url).toContain('link-b.html');
    expect((await focusedTab(h)).url).toContain('link-a.html');
  });

  it('copies selected text', async () => {
    await inPage(h, 'getSelection().selectAllChildren(document.querySelector("p"))', 'link-a');
    expect(await rightClick('p')).toEqual(['Copy']);
    await choose('Copy');
    await waitFor(
      'copied text',
      () => h.app.evaluate(({ clipboard }) => clipboard.readText()),
      (t) => t.startsWith('Readable body text'),
    );
  });

  it('pastes into a text field', async () => {
    await navigateTo(h, server.url('form.html'));
    await waitForPage(h, 'form');
    await h.app.evaluate(({ clipboard }) => clipboard.writeText('pasted text'));
    const p = await screenPointOf(h, '#name', 'form');
    await clickAt(h, p);
    const labels = await rightClick('#name', 'form');
    expect(labels).toEqual(['Cut', 'Copy', 'Paste', 'Select all']);
    await choose('Paste');
    await waitFor('pasted', () => inPage(h, 'document.getElementById("name").value', 'form'), (v) => v === 'pasted text');
  });
});

describe('D9 start panel', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch('', { searchUrl: searchUrl() });
  });
  afterAll(async () => h?.close());

  it('shows the empty state', async () => {
    const panel = h.shell.locator(`${FOCUSED} [data-testid="start-panel"]`);
    expect(await panel.isVisible()).toBe(true);
    const text = (await panel.textContent()) ?? '';
    expect(text.match(/Nothing saved yet/g)).toHaveLength(2);
    expect(text).toContain('Pages you bookmark will show up here.');
    expect(text).toContain('Pages you visit will show up here.');
  });

  it('its search box searches', async () => {
    await h.shell.fill(`${FOCUSED} [data-testid="start-search"]`, 'hyperSol');
    await h.shell.press(`${FOCUSED} [data-testid="start-search"]`, 'Enter');
    await waitForPage(h, '/search');
    expect(await inPage(h, 'document.getElementById("query").textContent', '/search')).toBe('hyperSol');
  });
});

describe('D10 shortcuts from inside a page', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
    await navigateTo(h, server.url('link-b.html'));
    await waitForPage(h, 'link-b');
  });
  afterAll(async () => h?.close());

  it('Alt+Left and Alt+Right go back and forward', async () => {
    await pressInPage(h, 'Left', ['alt']);
    await focusedWhere(h, 'back', (t) => t.url.endsWith('link-a.html') && t.state === 'loaded');
    await waitForPage(h, 'link-a');
    await pressInPage(h, 'Right', ['alt']);
    await focusedWhere(h, 'forward', (t) => t.url.endsWith('link-b.html') && t.state === 'loaded');
    await waitForPage(h, 'link-b');
  });

  it('Ctrl+R and F5 reload', async () => {
    for (const [key, mods] of [['R', ['control']], ['F5', []]] as const) {
      const page = await focusedPage(h);
      await inPage(h, 'window.__marker = 1', page);
      await pressInPage(h, key, [...mods], page);
      await waitFor(`${key} reload`, () => inPage(h, 'window.__marker ?? null', page), (m) => m === null);
      await waitForPage(h, page);
    }
  });

  it('Ctrl+L moves to the address field', async () => {
    await pressInPage(h, 'L', ['control']);
    await waitFor('address focus', () => addressHasFocus(h), (f) => f);
  });

  it('Ctrl+T opens a tab and Ctrl+Tab cycles', async () => {
    const page = { id: (await focusedPage(h)).id };
    await pressInPage(h, 'T', ['control'], page);
    await tabCount(h, 2);
    expect((await focusedTab(h)).state).toBe('start');
    await pressInShell(h, 'Tab', ['control']);
    await focusedWhere(h, 'back on the page', (t) => t.url.endsWith('link-b.html'));
    await settled(h);
    await pressInPage(h, 'Tab', ['control'], page);
    await focusedWhere(h, 'on the start tab', (t) => t.state === 'start');
  });

  it('Ctrl+W from a page closes its tab', async () => {
    await pressInShell(h, 'Tab', ['control']);
    const pageTab = await focusedWhere(h, 'page tab', (t) => t.url.endsWith('link-b.html'));
    await settled(h);
    await pressInPage(h, 'W', ['control']);
    await waitFor('page tab closed', () => tabs(h), (t) => !t.some((x) => x.id === pageTab.id));
  });
});

describe('D11 about', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('shows versions and closes with Escape', async () => {
    await h.shell.click(bar('menu'));
    await h.shell.click(bar('menu-about'));
    const about = h.shell.locator('hs-about [data-testid="about"]');
    await waitFor('about panel', () => about.isVisible(), (v) => v);
    const electron = await h.app.evaluate(() => process.versions.electron);
    expect(await h.shell.locator('hs-about [data-testid="about-engine"]').textContent()).toContain(`Electron ${electron}`);
    expect(await h.shell.locator('hs-about [data-testid="about-version"]').textContent()).toContain('Version 0.0.0');
    await h.shell.keyboard.press('Escape');
    await waitFor('about closed', () => about.isVisible(), (v) => !v);
  });

  it('the menu opens and closes tabs', async () => {
    await h.shell.click(bar('menu'));
    await h.shell.click(bar('menu-new-tab'));
    await tabCount(h, 2);
    await h.shell.click(bar('menu'));
    await h.shell.click(bar('menu-close-tab'));
    await tabCount(h, 1);
  });
});

/** The main-process test log (apps/browser/src/main/test-hooks.ts). */
interface MainLog {
  __hypersolTest: {
    blockedPopups: string[];
    menus: { labels: string[]; run(label: string): void }[];
  };
}

