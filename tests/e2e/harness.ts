import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

// No trailing separator: on Windows a backslash before the closing quote
// of a command-line argument escapes the quote and garbles every argument after it.
export const APP_DIR = resolve(fileURLToPath(new URL('../../apps/browser/', import.meta.url)));
const electronPath = createRequire(join(APP_DIR, 'package.json'))('electron') as unknown as string;

export interface Point {
  x: number;
  y: number;
}

export interface Harness {
  app: ElectronApplication;
  shell: Page;
  /** console.error output and uncaught errors from the shell and main process. */
  errors: string[];
  close(): Promise<void>;
}

export interface LaunchOptions {
  tilt?: number;
}

/**
 * Only the OS basics plus the test switch. The test runner's own variables
 * (NODE_OPTIONS and friends) must not leak into Electron's main process.
 */
function cleanEnv(): Record<string, string> {
  const keep = [
    'PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR',
    'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'USER', 'LANG',
    'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR',
  ];
  const env: Record<string, string> = { HYPERSOL_TEST: '1' };
  for (const k of keep) {
    const v = process.env[k];
    if (v !== undefined) env[k] = v;
  }
  return env;
}

/** Launches the built app with a throwaway profile and test hooks on. */
export async function launch(startUrl: string, opts: LaunchOptions = {}): Promise<Harness> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'hypersol-e2e-'));
  const args = [APP_DIR, `--start-url=${startUrl}`, `--hypersol-user-data=${userDataDir}`];
  if (opts.tilt !== undefined) args.push(`--tilt=${opts.tilt}`);
  const app = await electron.launch({
    executablePath: electronPath,
    args,
    env: cleanEnv(),
    timeout: 30_000,
  });
  const errors: string[] = [];
  const output: string[] = [];
  app.process().stderr?.on('data', (d: Buffer) => output.push(d.toString()));
  app.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`main: ${msg.text()}`);
  });
  const shell = await app.firstWindow({ timeout: 30_000 }).catch((e: unknown) => {
    throw new Error(`No window appeared: ${String(e)}\nApp output:\n${output.join('')}`);
  });
  shell.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`shell: ${msg.text()}`);
  });
  shell.on('pageerror', (err) => errors.push(`shell: ${err.message}`));
  await shell.waitForFunction(() => (window as unknown as ShellWindow).__hypersolShellTest?.ready === true);
  // A person clicks into a window that is already in front: wait until the
  // new window has finished activating before any input is sent.
  await waitFor(
    'the app window to have focus',
    () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused() ?? false),
    (focused) => focused,
    10_000,
  );
  return {
    app,
    shell,
    errors,
    close: async () => {
      await app.close();
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

/** The read-only hooks the shell exposes in test runs (renderer/main.ts). */
export interface ShellHooks {
  ready: boolean;
  frames(): number;
  layout(): { panelWidth: number; panelHeight: number; cameraZ: number };
  cameraOffset(): Point;
  parallaxPaused(): boolean;
  projectPagePoint(u: number, v: number): Point;
  panelQuad(): Point[];
  sceneColors(): Record<string, string>;
  status(): { state: string; url: string; title?: string; message?: string };
}

export type ShellWindow = Window & { __hypersolShellTest: ShellHooks };

/** Runs JavaScript inside a web page (a webview guest), chosen by address. */
export async function inPage<T>(h: Harness, expression: string, urlPart = ''): Promise<T> {
  return h.app.evaluate(
    async ({ webContents }, { expression, urlPart }) => {
      const guests = webContents
        .getAllWebContents()
        .filter((w) => w.getType() === 'webview' && w.getURL().includes(urlPart));
      const guest = guests[guests.length - 1];
      if (!guest) throw new Error(`No web page matching "${urlPart}"`);
      return guest.executeJavaScript(expression, true);
    },
    { expression, urlPart },
  ) as Promise<T>;
}

export async function waitFor<T>(
  what: string,
  probe: () => Promise<T>,
  ok: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const start = Date.now();
  let last: T | undefined;
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await probe();
      if (ok(last)) return last;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Timed out waiting for ${what}. Last value: ${JSON.stringify(last)}${
      lastError ? `; last error: ${String(lastError)}` : ''
    }`,
  );
}

/**
 * Waits until a page whose address contains urlPart has loaded and
 * painted. Chromium ignores input to a page until its first paint (so
 * does Chrome), and "loaded" can come a moment before that; a person
 * cannot click what has not appeared yet, so tests wait for the paint.
 */
export async function waitForPage(h: Harness, urlPart: string): Promise<void> {
  await waitFor(
    `page ${urlPart} to load`,
    () => inPage<string>(h, 'document.readyState', urlPart),
    (s) => s === 'complete',
  );
  await inPage(
    h,
    'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))',
    urlPart,
  );
}

type HookFn = { [K in keyof ShellHooks]: ShellHooks[K] extends (...a: never[]) => unknown ? K : never }[keyof ShellHooks];

/** Calls one of the shell's test hooks by name. */
export function shellCall<K extends HookFn>(
  h: Harness,
  name: K,
  ...args: Parameters<ShellHooks[K]>
): Promise<Awaited<ReturnType<ShellHooks[K]>>> {
  return h.shell.evaluate(
    ([name, args]) => {
      const k = (window as unknown as ShellWindow).__hypersolShellTest as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >;
      return k[name]!(...args);
    },
    [name, args] as [string, unknown[]],
  ) as Promise<Awaited<ReturnType<ShellHooks[K]>>>;
}

export function project(h: Harness, u: number, v: number): Promise<Point> {
  return shellCall(h, 'projectPagePoint', u, v);
}

/** Centre of an element inside the web page, in page pixels. */
export function pageCentre(h: Harness, selector: string, urlPart = ''): Promise<Point> {
  return inPage<Point>(
    h,
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    urlPart,
  );
}

/** Screen point of an element inside the web page, through the 3D tilt. */
export async function screenPointOf(h: Harness, selector: string, urlPart = ''): Promise<Point> {
  const c = await pageCentre(h, selector, urlPart);
  return project(h, c.x, c.y);
}

/** Resizes the window's content area and waits for the page to follow. */
export async function setContentSize(h: Harness, width: number, height: number): Promise<void> {
  await h.app.evaluate(
    ({ BrowserWindow }, [w, ht]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, ht!),
    [width, height],
  );
  await waitFor(
    `window ${width}x${height}`,
    () => h.shell.evaluate(() => [window.innerWidth, window.innerHeight]),
    ([w, ht]) => w === width && ht === height,
  );
  const layout = await shellCall(h, 'layout');
  await waitFor(
    'page to match the panel size',
    () => inPage<number[]>(h, '[window.innerWidth, window.innerHeight]'),
    ([w, ht]) => w === layout.panelWidth && ht === layout.panelHeight,
  );
  // As after a load: wait until the resized page has painted.
  await inPage(h, 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
}

/**
 * Types text into whatever has focus inside the web page.
 *
 * Playwright's keyboard enters at the shell window through the DevTools
 * protocol, and that path does not forward keys into a <webview> (tried
 * 2026-09-24; see TODO.md, C4). A real keyboard does reach the tilted
 * page (owner's manual check, 2026-09-25). So keys are delivered to the
 * page's own view here; the click that focuses the field still goes
 * through the window's real routing and hit-testing.
 */
export async function typeInPage(h: Harness, text: string, urlPart = ''): Promise<void> {
  await h.app.evaluate(
    ({ webContents }, { text, urlPart }) => {
      const guests = webContents
        .getAllWebContents()
        .filter((w) => w.getType() === 'webview' && w.getURL().includes(urlPart));
      const guest = guests[guests.length - 1];
      if (!guest) throw new Error(`No web page matching "${urlPart}"`);
      for (const ch of text) {
        const key = ch === '\n' ? 'Enter' : ch;
        guest.sendInputEvent({ type: 'keyDown', keyCode: key });
        guest.sendInputEvent({ type: 'char', keyCode: ch === '\n' ? '\r' : ch });
        guest.sendInputEvent({ type: 'keyUp', keyCode: key });
      }
    },
    { text, urlPart },
  );
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
