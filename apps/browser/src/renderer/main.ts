import './styles.css';
import { DEFAULT_TILT_DEG, clampTilt } from '@hypersol/scene-core';
import { defaultTheme } from '@hypersol/themes';
import { LivePanel } from './scene/live-panel';
import { Room } from './scene/room';
import { applyThemeCss } from './themes/apply';
import { normalizeAddress } from './url';

const params = new URLSearchParams(location.search);
const startUrl = params.get('startUrl') || 'about:blank';
const tiltParam = params.get('tilt');
const tiltDeg = tiltParam === null ? DEFAULT_TILT_DEG : clampTilt(Number(tiltParam));

applyThemeCss(document.documentElement, defaultTheme);

const roomElement = document.getElementById('room') as HTMLDivElement;
const form = document.getElementById('dev-address') as HTMLFormElement;
const input = document.getElementById('dev-address-input') as HTMLInputElement;
const statusText = document.getElementById('dev-status') as HTMLSpanElement;

const panel = new LivePanel(startUrl);
// Top inset leaves room for the temporary address field.
const room = new Room(roomElement, panel, defaultTheme, {
  tiltDeg,
  insets: { top: 56, right: 40, bottom: 40, left: 40 },
});

input.value = startUrl === 'about:blank' ? '' : startUrl;
if (startUrl === 'about:blank') input.focus();

const STATE_TEXT = {
  loading: 'Loading…',
  loaded: '',
  failed: "Couldn't load",
  crashed: 'Page stopped',
} as const;

panel.onStatus((status) => {
  statusText.textContent = STATE_TEXT[status.state];
  if (document.activeElement !== input && status.url && status.url !== 'about:blank') {
    input.value = status.url;
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = normalizeAddress(input.value);
  if (url === null) {
    statusText.textContent = 'Not a web address';
    return;
  }
  input.value = url;
  input.blur();
  panel.load(url);
});

// Read-only hooks for the end-to-end tests; present only in test runs.
if (params.get('test') === '1') {
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
      status: () => panel.status,
    },
  });
}
