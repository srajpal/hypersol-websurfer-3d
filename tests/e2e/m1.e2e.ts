/**
 * Milestone 1 end-to-end checks C1 to C11 (TODO.md).
 * Each block launches the built app with a throwaway profile against
 * sample pages served from 127.0.0.1.
 *
 * Input is sent with Playwright's mouse and keyboard, which enter
 * Chromium at the window (the same browser-side routing and hit-testing a
 * real mouse goes through), at the screen point where the tilted page
 * shows the target. Web page results are read back through the main
 * process with executeJavaScript.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURES_DIR, startFixtureServer, type FixtureServer } from './fixture-server';
import {
  inPage,
  launch,
  pageCentre,
  project,
  screenPointOf,
  setContentSize,
  shellCall,
  sleep,
  waitFor,
  waitForPage,
  type Harness,
  type Point,
} from './harness';

let server: FixtureServer;

beforeAll(async () => {
  server = await startFixtureServer();
});

afterAll(async () => {
  await server?.close();
});

/** The log the main process keeps in test runs (apps/browser/src/main/test-hooks.ts). */
interface MainTestGlobal {
  __hypersolTest: {
    attaches: { requestedPreload: string | null; appliedPreload: string; src: string; allowed: boolean }[];
    requests: string[];
  };
}

interface Click {
  id: string;
  x: number;
  y: number;
}

const GRID_IDS = [
  'top-left', 'top', 'top-right',
  'left', 'centre', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

/** Clicks every grid button at its projected screen point; returns what the page saw. */
async function clickGrid(h: Harness): Promise<{ expected: Record<string, Point>; clicks: Click[] }> {
  await inPage(h, 'window.__fixture.clicks = []', 'click-grid');
  const expected: Record<string, Point> = {};
  for (const id of GRID_IDS) {
    const centre = await pageCentre(h, `#${id}`, 'click-grid');
    expected[id] = centre;
    const screen = await project(h, centre.x, centre.y);
    await h.shell.mouse.click(screen.x, screen.y);
    await waitFor(
      `click on ${id} to register`,
      () => inPage<number>(h, 'window.__fixture.clicks.length', 'click-grid'),
      (n) => n >= GRID_IDS.indexOf(id) + 1,
      5000,
    );
  }
  const clicks = await inPage<Click[]>(h, 'window.__fixture.clicks', 'click-grid');
  return { expected, clicks };
}

function expectGridHits(result: { expected: Record<string, Point>; clicks: Click[] }, label: string): void {
  expect(result.clicks.map((c) => c.id), label).toEqual(GRID_IDS);
  for (const c of result.clicks) {
    const want = result.expected[c.id]!;
    expect(Math.abs(c.x - want.x), `${label} ${c.id} x`).toBeLessThanOrEqual(3);
    expect(Math.abs(c.y - want.y), `${label} ${c.id} y`).toBeLessThanOrEqual(3);
  }
}

/** A point over the room, clearly outside the page. */
async function roomPoint(h: Harness): Promise<Point> {
  const height = await h.shell.evaluate(() => window.innerHeight);
  return { x: 12, y: height - 12 };
}

describe('C1 app launches', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('opens a visible window with the room rendered and no console errors', async () => {
    const visible = await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible());
    expect(visible).toBe(true);
    const canvas = await h.shell.evaluate(() => {
      const c = document.querySelector('#room canvas') as HTMLCanvasElement | null;
      return c ? [c.width, c.height] : [0, 0];
    });
    expect(canvas[0]).toBeGreaterThan(0);
    expect(canvas[1]).toBeGreaterThan(0);
    expect(await shellCall(h, 'frames')).toBeGreaterThan(0);
    expect(await inPage<string>(h, 'document.title', 'link-a')).toBe('Link A');
    await sleep(500);
    expect(h.errors).toEqual([]);
  });

  it('uses the same theme value for CSS and 3D colours', async () => {
    const colors = await shellCall(h, 'sceneColors');
    const css = await h.shell.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        accent: s.getPropertyValue('--hs-accent').trim(),
        desk: s.getPropertyValue('--hs-desk').trim(),
        floorGrid: s.getPropertyValue('--hs-floor-grid').trim(),
      };
    });
    expect(colors).toEqual(css);
  });
});

for (const tilt of [0, 10, 20]) {
  describe(`C2 clicks land at ${tilt} degrees`, () => {
    let h: Harness;
    beforeAll(async () => {
      h = await launch(server.url('click-grid.html'), { tilt });
      await waitForPage(h, 'click-grid');
    });
    afterAll(async () => h?.close());

    for (const [w, ht] of [
      [1280, 800],
      [1024, 700],
    ] as const) {
      it(`hits all 9 buttons at ${w}x${ht}`, async () => {
        await setContentSize(h, w, ht);
        expectGridHits(await clickGrid(h), `${tilt}deg ${w}x${ht}`);
      });
    }
  });
}

describe('C3 parallax does not shift targets', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('click-grid.html'));
    await waitForPage(h, 'click-grid');
  });
  afterAll(async () => h?.close());

  it('moves the camera over the room, holds it over the page, and clicks still land', async () => {
    const room = await roomPoint(h);
    await h.shell.mouse.move(room.x + 40, room.y - 40);
    await h.shell.mouse.move(room.x, room.y, { steps: 8 });
    const moved = await waitFor(
      'camera to settle after moving',
      async () => {
        const a = await shellCall(h, 'cameraOffset');
        await sleep(100);
        const b = await shellCall(h, 'cameraOffset');
        return { a, b };
      },
      ({ a, b }) => a.x === b.x && a.y === b.y && (a.x !== 0 || a.y !== 0),
    );
    expect(Math.abs(moved.b.x)).toBeGreaterThan(1);

    // Into the page, then wander around inside it.
    const centre = await screenPointOf(h, '#centre', 'click-grid');
    await h.shell.mouse.move(centre.x, centre.y);
    await sleep(400);
    const held = await shellCall(h, 'cameraOffset');
    for (const id of ['top-left', 'bottom-right', 'top-right', 'bottom-left']) {
      const p = await screenPointOf(h, `#${id}`, 'click-grid');
      await h.shell.mouse.move(p.x, p.y, { steps: 6 });
    }
    await sleep(400);
    expect(await shellCall(h, 'cameraOffset')).toEqual(held);

    expectGridHits(await clickGrid(h), 'after parallax');
    expect(await shellCall(h, 'cameraOffset')).toEqual(held);
  });
});

describe('C4 typing', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('form.html'));
    await waitForPage(h, 'form');
  });
  afterAll(async () => h?.close());

  it('types into a text input', async () => {
    const p = await screenPointOf(h, '#name', 'form');
    await h.shell.mouse.click(p.x, p.y);
    await h.shell.keyboard.type('Hello, 3D world! 123');
    expect(await inPage<string>(h, 'document.getElementById("name").value', 'form')).toBe('Hello, 3D world! 123');
  });

  it('types several lines into a textarea', async () => {
    const p = await screenPointOf(h, '#notes', 'form');
    await h.shell.mouse.click(p.x, p.y);
    await h.shell.keyboard.type('line one');
    await h.shell.keyboard.press('Enter');
    await h.shell.keyboard.type('line two');
    expect(await inPage<string>(h, 'document.getElementById("notes").value', 'form')).toBe('line one\nline two');
  });

  it('ticks a checkbox', async () => {
    const p = await screenPointOf(h, '#agree', 'form');
    await h.shell.mouse.click(p.x, p.y);
    expect(await inPage<boolean>(h, 'document.getElementById("agree").checked', 'form')).toBe(true);
  });
});

describe('C5 scrolling', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('long.html'));
    await waitForPage(h, 'long');
  });
  afterAll(async () => h?.close());

  it('scrolls the page when the pointer is over it', async () => {
    const layout = await shellCall(h, 'layout');
    const p = await project(h, layout.panelWidth / 2, layout.panelHeight / 2);
    await h.shell.mouse.move(p.x, p.y);
    await h.shell.mouse.wheel(0, 800);
    await waitFor('page to scroll', () => inPage<number>(h, 'window.scrollY', 'long'), (y) => y > 0);
  });

  it('does not scroll the page when the pointer is over the room', async () => {
    const room = await roomPoint(h);
    await h.shell.mouse.move(room.x, room.y);
    await sleep(300);
    const before = await inPage<number>(h, 'window.scrollY', 'long');
    await h.shell.mouse.wheel(0, 800);
    await sleep(600);
    expect(await inPage<number>(h, 'window.scrollY', 'long')).toBe(before);
    expect(await h.shell.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  });
});

describe('C6 hover and links', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('hover.html'));
    await waitForPage(h, 'hover');
  });
  afterAll(async () => h?.close());

  it('reports hover on and off a target', async () => {
    const t = await screenPointOf(h, '#target', 'hover');
    await h.shell.mouse.move(t.x, t.y, { steps: 5 });
    await waitFor('hover on', () => inPage<boolean>(h, 'window.__fixture.hovered', 'hover'), (v) => v === true);
    const corner = await project(h, 30, 30);
    await h.shell.mouse.move(corner.x, corner.y, { steps: 5 });
    await waitFor('hover off', () => inPage<boolean>(h, 'window.__fixture.hovered', 'hover'), (v) => v === false);
  });

  it('follows a link to the second page', async () => {
    await h.shell.fill('#dev-address-input', server.url('link-a.html'));
    await h.shell.press('#dev-address-input', 'Enter');
    await waitForPage(h, 'link-a');
    const p = await screenPointOf(h, '#go', 'link-a');
    await h.shell.mouse.click(p.x, p.y);
    await waitForPage(h, 'link-b');
    expect(await inPage<string>(h, 'document.title', 'link-b')).toBe('Link B');
    await waitFor(
      'address field to show page B',
      () => h.shell.inputValue('#dev-address-input'),
      (v) => v.endsWith('link-b.html'),
    );
  });
});

describe('C7 page isolation', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('node-probe.html'));
    await waitForPage(h, 'node-probe');
  });
  afterAll(async () => h?.close());

  it('gives web pages no Node access', async () => {
    const probe = await inPage<Record<string, string>>(h, 'window.__fixture', 'node-probe');
    expect(probe).toEqual({
      require: 'undefined',
      process: 'undefined',
      module: 'undefined',
      evilPreloadRan: 'undefined',
    });
  });

  it('replaces a page-requested preload with the trusted stub', async () => {
    const evil = pathToFileURL(join(FIXTURES_DIR, 'evil-preload.cjs')).href;
    await h.shell.evaluate(
      ([preload, src]) => {
        const wv = document.createElement('webview');
        wv.setAttribute('preload', preload!);
        wv.setAttribute('src', src!);
        wv.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:100px;opacity:0.01';
        document.body.append(wv);
      },
      [evil, server.url('node-probe.html?second=1')],
    );
    await waitForPage(h, 'second=1');
    const probe = await inPage<Record<string, string>>(h, 'window.__fixture', 'second=1');
    expect(probe['evilPreloadRan']).toBe('undefined');
    expect(probe['require']).toBe('undefined');

    const attaches = await h.app.evaluate(() => (globalThis as unknown as MainTestGlobal).__hypersolTest.attaches);
    const last = attaches[attaches.length - 1]!;
    expect(last.src).toContain('second=1');
    expect(last.appliedPreload.replace(/\\/g, '/')).toMatch(/\/preload\/page\.js$/);
    expect(String(last.requestedPreload)).toContain('evil-preload');
  });
});

describe('C8 no unexpected traffic', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('requests nothing but local files and 127.0.0.1', async () => {
    for (const page of ['form.html', 'long.html', 'hover.html', 'click-grid.html']) {
      await h.shell.fill('#dev-address-input', server.url(page));
      await h.shell.press('#dev-address-input', 'Enter');
      await waitForPage(h, page.replace('.html', ''));
    }
    await sleep(1000);
    const requests = await h.app.evaluate(() => (globalThis as unknown as MainTestGlobal).__hypersolTest.requests);
    expect(requests.length).toBeGreaterThan(0);
    const local = (u: string) =>
      u.startsWith(server.base) || /^(file|data|blob|about|devtools|chrome-error):/.test(u);
    expect(requests.filter((u) => !local(u))).toEqual([]);
  });
});

describe('C9 idle efficiency', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('draws no frames while idle', async () => {
    // Idle: page loaded, pointer still, no resize, camera settled.
    await sleep(1500);
    const before = await shellCall(h, 'frames');
    await sleep(2000);
    expect(await shellCall(h, 'frames')).toBe(before);
  });

  it('draws about 60 frames a second while the camera follows the pointer', async () => {
    const room = await roomPoint(h);
    const before = await shellCall(h, 'frames');
    const start = Date.now();
    let i = 0;
    while (Date.now() - start < 1000) {
      const dx = (i++ % 2) * 300;
      await h.shell.mouse.move(room.x + dx, room.y - 200 - dx / 3, { steps: 4 });
    }
    const seconds = (Date.now() - start) / 1000;
    const fps = ((await shellCall(h, 'frames')) - before) / seconds;
    console.log(`C9: ${fps.toFixed(1)} frames per second during parallax`);
    expect(fps).toBeGreaterThanOrEqual(50);
  });
});

describe('C10 load failure', () => {
  let h: Harness;
  let own: FixtureServer;
  beforeAll(async () => {
    own = await startFixtureServer();
    h = await launch(own.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('shows plain "couldn\'t load" text and keeps running', async () => {
    const target = own.url('form.html');
    await own.close();
    await h.shell.fill('#dev-address-input', target);
    await h.shell.press('#dev-address-input', 'Enter');
    await waitFor(
      'failure message',
      () => h.shell.locator('[data-testid="page-overlay"]').textContent(),
      (t) => (t ?? '').includes("Couldn't load this page."),
    );
    expect(await h.shell.locator('[data-testid="page-overlay"]').isVisible()).toBe(true);
    expect((await shellCall(h, 'status')).state).toBe('failed');
    expect(await h.shell.textContent('#dev-status')).toBe("Couldn't load");
    expect(await h.shell.evaluate(() => 1 + 1)).toBe(2);
    expect(await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });
});

describe('C11 page crash', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await launch(server.url('link-a.html'));
    await waitForPage(h, 'link-a');
  });
  afterAll(async () => h?.close());

  it('survives a crashed page and reloads it', async () => {
    await h.app.evaluate(({ webContents }) => {
      const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview');
      guest!.forcefullyCrashRenderer();
    });
    await waitFor(
      'crash message',
      () => h.shell.locator('[data-testid="page-overlay"]').textContent(),
      (t) => (t ?? '').includes('This page stopped working.'),
    );
    expect((await shellCall(h, 'status')).state).toBe('crashed');

    // Click Reload where it appears on the tilted page.
    const centre = await h.shell.evaluate(() => {
      const b = document.getElementById('panel-reload')!;
      const panel = document.querySelector('.hs-panel') as HTMLElement;
      let x = b.offsetWidth / 2;
      let y = b.offsetHeight / 2;
      let el: HTMLElement | null = b;
      while (el && el !== panel) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      return { x, y };
    });
    const p = await project(h, centre.x, centre.y);
    await h.shell.mouse.click(p.x, p.y);
    await waitForPage(h, 'link-a');
    await waitFor('overlay to hide', () => h.shell.locator('[data-testid="page-overlay"]').isVisible(), (v) => !v);
    await waitFor('loaded state', () => shellCall(h, 'status'), (s) => s.state === 'loaded');
  });
});
