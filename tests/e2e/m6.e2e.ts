/**
 * Milestone 6 end-to-end checks H1 to H7 (TODO.md): the theme switch,
 * Settings > Theme (with "Match the system"), the room following the
 * theme, the window, page tilt, and the layers view's outline. H5
 * (contrast) and H8 (no hard-coded colours) are unit tests.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { daylight, nebula, type Theme } from '../../packages/themes/src/index';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from './fixture-server';
import {
  clickAt,
  inPage,
  launch,
  pressInShell,
  removeFolder,
  screenPointOf,
  shellCall,
  sleep,
  waitFor,
  waitForPage,
  type Harness,
} from './harness';

let server: FixtureServer;
const profiles: string[] = [];

function newProfile(settings?: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'hypersol-e2e-profile-'));
  profiles.push(dir);
  if (settings) writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings));
  return dir;
}

beforeAll(async () => {
  server = await startFixtureServer();
});

afterAll(async () => {
  await server?.close();
  for (const dir of profiles) await removeFolder(dir);
});

const THEME_BUTTON = 'hs-theme-button [data-testid="theme"]';
const SET = (id: string) => `hs-settings [data-testid="${id}"]`;
const themeId = (h: Harness) => shellCall(h, 'theme');
const savedSettings = (profile: string) => JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')) as Record<string, unknown>;

async function openSettings(h: Harness): Promise<void> {
  if ((await shellCall(h, 'openPanel')) !== 'settings') await pressInShell(h, ',', ['control']);
  await waitFor('settings open', () => shellCall(h, 'openPanel'), (p) => p === 'settings');
}

/** The HUD's colours and the room's colours both come from `theme`. */
async function expectTheme(h: Harness, theme: Theme): Promise<void> {
  expect(await themeId(h)).toBe(theme.id);
  const css = await h.shell.evaluate(() => {
    const s = document.documentElement.style;
    return {
      accent: s.getPropertyValue('--hs-accent'),
      text: s.getPropertyValue('--hs-text'),
      glass: s.getPropertyValue('--hs-panel-glass'),
      scheme: s.colorScheme,
    };
  });
  expect(css).toEqual({ accent: theme.colors.accent, text: theme.colors.text, glass: theme.colors.panelGlass, scheme: theme.scheme });
  expect(await shellCall(h, 'sceneColors')).toEqual({
    accent: theme.colors.accent,
    desk: theme.colors.desk,
    floorGrid: theme.colors.floorGrid,
    horizon: theme.colors.horizon,
    fog: theme.colors.backgroundBottom,
    ambient: theme.lighting.ambient.color,
    key: theme.lighting.key.color,
    sun: theme.room.sun ? 'shown' : 'hidden',
  });
}

describe('H1, H3, H4, H7: switching themes', () => {
  let h: Harness;
  let profile: string;
  beforeAll(async () => {
    profile = newProfile();
    h = await launch(server.url('layers.html'), { userDataDir: profile });
    await waitForPage(h, 'layers.html');
  });
  afterAll(async () => h?.close());

  it('H1 and H3 the button switches Nebula and Daylight; the HUD and the room change together', async () => {
    await expectTheme(h, nebula);
    await h.shell.click(THEME_BUTTON);
    await waitFor('Daylight', () => themeId(h), (id) => id === 'daylight');
    await expectTheme(h, daylight);
    expect(await h.shell.locator(THEME_BUTTON).getAttribute('aria-label')).toBe('Theme: Daylight. Switch to Nebula');
    await waitFor('saved', async () => savedSettings(profile)['theme'], (t) => t === 'daylight');
  });

  it('H4 the window background and title bar follow the theme', async () => {
    const win = () =>
      h.app.evaluate(({ BrowserWindow, nativeTheme }) => ({
        background: BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toLowerCase(),
        source: nativeTheme.themeSource,
      }));
    await waitFor('light window', win, (w) => w.source === 'light');
    expect((await win()).background).toBe(daylight.colors.backgroundBottom);
    await h.shell.click(THEME_BUTTON);
    await waitFor('dark window', win, (w) => w.source === 'dark' && w.background === nebula.colors.backgroundBottom);
  });

  it('H7 the layers view outlines sections in the theme accent', async () => {
    const accent = () => inPage<string>(h, `document.documentElement.style.getPropertyValue('--hs-layer-accent')`, 'layers.html');
    await waitFor('Nebula accent', accent, (a) => a === `${nebula.colors.accent}99`);
    await h.shell.click(THEME_BUTTON);
    await waitFor('Daylight accent', accent, (a) => a === `${daylight.colors.accent}99`);
  });
});

describe('H2: Settings > Theme', () => {
  it('applies each choice at once and after a restart, and "Match the system" follows the system', async () => {
    const profile = newProfile();
    let h = await launch(server.url('link-a.html'), { userDataDir: profile });
    try {
      await waitForPage(h, 'link-a');
      await openSettings(h);
      expect(await h.shell.locator(SET('set-theme-nebula')).isChecked()).toBe(true);
      await h.shell.click(SET('set-theme-daylight'));
      await waitFor('Daylight', () => themeId(h), (id) => id === 'daylight');
      await h.shell.click(SET('set-theme-system'));
      // The system's setting, as the shell sees it, picks the theme.
      await h.shell.emulateMedia({ colorScheme: 'dark' });
      await waitFor('dark system: Nebula', () => themeId(h), (id) => id === 'nebula');
      await h.shell.emulateMedia({ colorScheme: 'light' });
      await waitFor('light system: Daylight', () => themeId(h), (id) => id === 'daylight');
      await h.shell.click(SET('set-theme-daylight'));
      await waitFor('saved', async () => savedSettings(profile)['theme'], (t) => t === 'daylight');
    } finally {
      await h.close();
    }
    h = await launch(server.url('link-a.html'), { userDataDir: profile });
    try {
      await waitForPage(h, 'link-a');
      await expectTheme(h, daylight);
    } finally {
      await h.close();
    }
  });
});

describe('H6: page tilt', () => {
  it('re-tilts the page at once and after a restart, and clicks land at 0 and 20 degrees', async () => {
    const profile = newProfile({ layersOnOpen: false });
    let h = await launch(server.url('form.html'), { userDataDir: profile });
    const clickField = async () => {
      await inPage(h, 'document.activeElement && document.activeElement.blur()', 'form');
      await clickAt(h, await screenPointOf(h, '#name', 'form'));
      await waitFor('field focused', () => inPage<string>(h, 'document.activeElement.id', 'form'), (id) => id === 'name');
    };
    try {
      await waitForPage(h, 'form');
      expect(await shellCall(h, 'tilt')).toBe(10);
      await openSettings(h);
      await h.shell.locator(SET('set-tilt')).fill('0');
      await waitFor('flat', () => shellCall(h, 'tilt'), (t) => t === 0);
      expect(await shellCall(h, 'layout')).toMatchObject({ rotationY: 0 });
      await pressInShell(h, 'Escape');
      await sleep(300);
      await clickField();
      await openSettings(h);
      await h.shell.locator(SET('set-tilt')).fill('20');
      await waitFor('tilted', () => shellCall(h, 'tilt'), (t) => t === 20);
      await pressInShell(h, 'Escape');
      await sleep(300);
      await clickField();
      await waitFor('saved', async () => savedSettings(profile)['pageTilt'], (t) => t === 20);
    } finally {
      await h.close();
    }
    h = await launch(server.url('form.html'), { userDataDir: profile });
    try {
      await waitForPage(h, 'form');
      await waitFor('tilt kept', () => shellCall(h, 'tilt'), (t) => t === 20);
    } finally {
      await h.close();
    }
  });

  it('a tilt given on the command line wins over the setting', async () => {
    const h = await launch(server.url('form.html'), { userDataDir: newProfile({ pageTilt: 3 }), tilt: 15 });
    try {
      await waitForPage(h, 'form');
      await sleep(300);
      expect(await shellCall(h, 'tilt')).toBe(15);
    } finally {
      await h.close();
    }
  });
});
