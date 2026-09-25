import './styles.css';
import './hud/toolbar';
import './hud/about';
import { DEFAULT_TILT_DEG, clampTilt } from '@hypersol/scene-core';
import { defaultTheme } from '@hypersol/themes';
import type { ShellBridge } from '../shared/commands';
import { App } from './app';
import type { CardPart } from './scene/tab-card';
import { applyThemeCss } from './themes/apply';
import { DEFAULT_SEARCH_URL } from './url';

const params = new URLSearchParams(location.search);
const tiltParam = params.get('tilt');
const bridge = (window as unknown as { hypersol: ShellBridge }).hypersol;

applyThemeCss(document.documentElement, defaultTheme);

const toolbar = document.querySelector('hs-toolbar')!;
const about = document.querySelector('hs-about')!;
about.appVersion = params.get('appVersion') ?? '';
about.electron = bridge.versions.electron;
about.chrome = bridge.versions.chrome;
about.addEventListener('hs-about-closed', () => app.focusedView?.focusContent());

const app = new App({
  startUrl: params.get('startUrl') ?? '',
  tiltDeg: tiltParam === null ? DEFAULT_TILT_DEG : clampTilt(Number(tiltParam)),
  searchUrl: params.get('searchUrl') ?? DEFAULT_SEARCH_URL,
  theme: defaultTheme,
  bridge,
  roomElement: document.getElementById('room') as HTMLElement,
  toolbar,
  about,
  tabList: document.getElementById('tab-list') as HTMLElement,
});

// Read-only hooks for the end-to-end tests; present only in test runs.
if (params.get('test') === '1') {
  const { room, store } = app;
  Object.assign(window, {
    __hypersolShellTest: {
      ready: true,
      frames: () => room.frames,
      layout: () => room.layoutInfo,
      cameraOffset: () => room.parallax.offset,
      parallaxPaused: () => room.parallax.paused,
      projectPagePoint: (u: number, v: number) => room.projectPagePoint(u, v),
      panelQuad: () => room.screenQuad(),
      sceneColors: () => room.sceneColors(),
      status: () => app.focusedView?.status ?? null,
      tabs: () =>
        store.tabs.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          state: t.state,
          focused: t.id === store.focusedId,
          hasSnapshot: room.hasSnapshot(t.id),
          hasFavicon: Boolean(t.favicon),
          canGoBack: t.canGoBack,
          canGoForward: t.canGoForward,
        })),
      focusedTabId: () => store.focusedId,
      cardPoint: (key: number | 'plus', part: CardPart) => room.cardPoint(key, part),
      rail: () => room.rail,
      animating: () => room.animating,
      webContentsIdOf: (tabId: number) => app.viewOf(tabId)?.webContentsId ?? null,
    },
  });
}
