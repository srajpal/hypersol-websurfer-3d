/**
 * The layers view inside a web page (TODO.md milestone 5), run from the
 * trusted page preload. It lifts the page's top-level sections and its
 * images into separate depths, and reports where the page's images are.
 *
 * Nothing is exposed to the page. The page can see the data-hs-layer
 * attribute and a CSS variable on lifted elements, and nothing else. The
 * styles go in through webFrame.insertCSS, so a page's content security
 * policy cannot block them.
 */
import { ipcRenderer, webFrame } from 'electron';
import { LAYERS_CHANNEL, MAX_PAGE_IMAGES, PAGE_IMAGES_CHANNEL, parseLayersState, type PageImage } from '../shared/layers';
import { LAYERS, findSectionContainer, largest, liftTransform, vanishingPoint, type Box } from './layers-plan';

const ATTR = 'data-hs-layer';
const ANIMATING = 'data-hs-animating';
const ANIMATION_MS = 250;
/** Page changes settle this long before the layers are chosen again. */
const REPICK_MS = 400;
const REPORT_MS = 150;

const CSS = `
[${ATTR}] { transform: var(--hs-lift) !important; transform-origin: 0 0 !important; will-change: transform; }
[${ATTR}='section'] { box-shadow: 0 18px 40px rgb(0 0 0 / 30%), 0 0 0 1px var(--hs-layer-accent, #39e6ff) !important; }
[${ATTR}='image'] { box-shadow: 0 14px 30px rgb(0 0 0 / 38%) !important; }
html[${ANIMATING}] [${ATTR}] { transition: transform ${ANIMATION_MS}ms ease !important; }
@media (prefers-reduced-motion: reduce) { html[${ANIMATING}] [${ATTR}] { transition: none !important; } }
`;

interface Layer {
  kind: 'section' | 'image';
  depth: number;
  scale: number;
  /** Untransformed box in document coordinates. */
  box: Box;
}

const layers = new Map<HTMLElement, Layer>();
let on = false;
let parallax = { x: 0, y: 0 };
let cssAdded = false;
let repickTimer: number | undefined;
let reportTimer: number | undefined;
let frame = 0;
let offTimer: number | undefined;
let lastReport = '';

/** The element's box without transforms, in document coordinates (offsets ignore transforms). */
function documentBox(el: HTMLElement): Box {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  // Scrolled containers between the element and the page move it too.
  const root = document.scrollingElement;
  for (let node = el.parentElement; node && node !== document.body && node !== root; node = node.parentElement) {
    x -= node.scrollLeft;
    y -= node.scrollTop;
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

/** Elements that stay put on screen (fixed or sticky), and everything that contains one. */
function pinnedSet(): Set<Element> {
  const pinned = new Set<Element>();
  for (const el of document.body.querySelectorAll('*')) {
    const position = getComputedStyle(el).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    for (let node: Element | null = el; node && !pinned.has(node); node = node.parentElement) pinned.add(node);
  }
  return pinned;
}

function liftable(el: Element, pinned: Set<Element>): el is HTMLElement {
  if (!(el instanceof HTMLElement) || pinned.has(el)) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.display === 'contents') return false;
  // The page's own transforms and animations are left alone.
  if (!el.hasAttribute(ATTR) && (style.transform !== 'none' || style.animationName !== 'none')) return false;
  return el.offsetWidth > 0 && el.offsetHeight > 0;
}

function visibleChildren(el: Element): HTMLElement[] {
  return [...el.children].filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(c.tagName) && c.offsetHeight > 0,
  );
}

/** Chooses the sections and images to lift. */
function pick(): Map<HTMLElement, Layer> {
  const chosen = new Map<HTMLElement, Layer>();
  const body = document.body;
  if (!body) return chosen;
  const pinned = pinnedSet();
  const at = (path: number[]): HTMLElement => path.reduce<HTMLElement>((el, i) => visibleChildren(el)[i]!, body);
  const path = findSectionContainer(
    (p) => visibleChildren(at(p)).map((c) => ({ x: 0, y: 0, width: c.offsetWidth, height: c.offsetHeight })),
    body.scrollWidth * Math.max(body.scrollHeight, 1),
  );
  const container = at(path);
  const sections = largest(
    visibleChildren(container).filter((c) => c.offsetHeight >= LAYERS.minSectionHeight && liftable(c, pinned)),
    (c) => c.offsetWidth * c.offsetHeight,
    LAYERS.maxSections,
  );
  for (const el of sections) {
    chosen.set(el, { kind: 'section', depth: LAYERS.sectionDepth, scale: LAYERS.sectionScale, box: documentBox(el) });
  }
  const images = largest(
    [...body.querySelectorAll<HTMLElement>('img, video, canvas')].filter(
      (el) => el.offsetWidth >= LAYERS.minImageSide && el.offsetHeight >= LAYERS.minImageSide && liftable(el, pinned),
    ),
    (el) => el.offsetWidth * el.offsetHeight,
    LAYERS.maxImages,
  );
  for (const el of images) {
    // An image inside a lifted section rises further above it; one outside rises from the page.
    const inSection = sections.some((s) => s.contains(el));
    chosen.set(el, {
      kind: 'image',
      depth: inSection ? LAYERS.imageDepth : LAYERS.sectionDepth + LAYERS.imageDepth,
      scale: 1,
      box: documentBox(el),
    });
  }
  return chosen;
}

function apply(lifted: boolean): void {
  const view = vanishingPoint({ width: innerWidth, height: innerHeight }, parallax);
  const vp = { x: view.x + scrollX, y: view.y + scrollY };
  for (const [el, layer] of layers) {
    el.style.setProperty('--hs-lift', liftTransform(layer.box, vp, lifted ? layer.depth : 0, lifted ? layer.scale : 1));
  }
}

function clear(): void {
  for (const el of layers.keys()) {
    el.removeAttribute(ATTR);
    el.style.removeProperty('--hs-lift');
  }
  layers.clear();
}

/** Chooses the layers again (the page changed) and lifts them, without animating. */
function repick(): void {
  window.clearTimeout(repickTimer);
  if (!on) return;
  const next = pick();
  for (const el of layers.keys()) {
    if (!next.has(el)) {
      el.removeAttribute(ATTR);
      el.style.removeProperty('--hs-lift');
    }
  }
  layers.clear();
  for (const [el, layer] of next) {
    layers.set(el, layer);
    el.setAttribute(ATTR, layer.kind);
  }
  apply(true);
}

function setOn(next: boolean, animate: boolean): void {
  window.clearTimeout(offTimer);
  const root = document.documentElement;
  if (animate) root.setAttribute(ANIMATING, '');
  else root.removeAttribute(ANIMATING);
  if (next) {
    if (!cssAdded) {
      void webFrame.insertCSS(CSS, { cssOrigin: 'author' });
      cssAdded = true;
    }
    on = true;
    if (layers.size === 0) {
      for (const [el, layer] of pick()) {
        layers.set(el, layer);
        el.setAttribute(ATTR, layer.kind);
      }
      if (animate) {
        apply(false);
        void root.offsetWidth; // start from flat, so the lift animates
      }
    }
    apply(true);
  } else {
    on = false;
    if (animate && layers.size > 0) {
      apply(false);
      offTimer = window.setTimeout(clear, ANIMATION_MS + 50);
    } else {
      clear();
    }
  }
  if (animate) window.setTimeout(() => root.removeAttribute(ANIMATING), ANIMATION_MS + 50);
}

/** Reports the images in view (without the lift) to the shell, when they change. */
function report(): void {
  window.clearTimeout(reportTimer);
  const images: PageImage[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('img, video, canvas')) {
    if (images.length >= MAX_PAGE_IMAGES) break;
    if (el.offsetWidth < 16 || el.offsetHeight < 16) continue;
    const box = documentBox(el);
    const x = box.x - scrollX;
    const y = box.y - scrollY;
    if (x + box.width <= 0 || y + box.height <= 0 || x >= innerWidth || y >= innerHeight) continue;
    const kind = el.tagName === 'IMG' ? 'img' : el.tagName === 'VIDEO' ? 'video' : 'canvas';
    const src = el instanceof HTMLImageElement ? el.currentSrc || el.src : el instanceof HTMLVideoElement ? el.currentSrc : '';
    images.push({
      x,
      y,
      width: box.width,
      height: box.height,
      src: /^https?:\/\//i.test(src) ? src.slice(0, 2048) : '',
      alt: el instanceof HTMLImageElement ? el.alt.slice(0, 200) : '',
      kind,
    });
  }
  const text = JSON.stringify(images);
  if (text === lastReport) return;
  lastReport = text;
  ipcRenderer.sendToHost(PAGE_IMAGES_CHANNEL, images);
}

const scheduleRepick = () => {
  window.clearTimeout(repickTimer);
  repickTimer = window.setTimeout(repick, REPICK_MS);
};
const scheduleReport = () => {
  window.clearTimeout(reportTimer);
  reportTimer = window.setTimeout(report, REPORT_MS);
};

function onScrollOrResize(resized: boolean): void {
  scheduleReport();
  if (!on) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (resized) for (const [el, layer] of layers) layer.box = documentBox(el);
    apply(true);
  });
  if (resized) scheduleRepick();
}

if (window === window.top) {
  ipcRenderer.on(LAYERS_CHANNEL, (_event, raw: unknown) => {
    const state = parseLayersState(raw);
    if (!state) return;
    const moved = state.parallax.x !== parallax.x || state.parallax.y !== parallax.y;
    parallax = state.parallax;
    // The theme's accent outlines the lifted sections.
    document.documentElement?.style.setProperty('--hs-layer-accent', `${state.accent}99`);
    const run = () => {
      if (state.on !== on) setOn(state.on, state.animate);
      else if (on && moved) apply(true);
    };
    if (document.body) run();
    else window.addEventListener('DOMContentLoaded', run, { once: true });
  });

  window.addEventListener('DOMContentLoaded', () => {
    new MutationObserver((records) => {
      // Our own attribute changes are not page changes.
      if (records.some((r) => r.type === 'childList')) {
        scheduleRepick();
        scheduleReport();
      }
    }).observe(document.body, { childList: true, subtree: true });
    scheduleReport();
  });
  window.addEventListener('load', () => {
    scheduleRepick();
    scheduleReport();
  });
  // Images that finish loading change the layout.
  document.addEventListener('load', () => (scheduleRepick(), scheduleReport()), true);
  window.addEventListener('scroll', () => onScrollOrResize(false), { passive: true });
  window.addEventListener('resize', () => onScrollOrResize(true), { passive: true });
}
