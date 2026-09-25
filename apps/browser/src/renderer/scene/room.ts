import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferAttribute,
  type Object3D,
} from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import {
  Parallax,
  clampScroll,
  computePanelLayout,
  computeTabArc,
  pointInPolygon,
  scrollToShow,
  type Insets,
  type PanelLayout,
  type TabArcInput,
  type TabArcLayout,
  type Vec2,
} from '@hypersol/scene-core';
import type { Theme } from '@hypersol/themes';
import { CARD_HEIGHT, CARD_WIDTH, TabCard, type CardModel, type CardPart } from './tab-card';
import type { TabView } from './tab-view';

/** Height kept free at the top for the HUD. */
export const HUD_HEIGHT = 64;
// The rail starts well inside the window: cards sit nearer the camera than
// the page, so perspective pushes them outward.
const RAIL = { left: 52, width: CARD_WIDTH, bottomMargin: 24, gap: 16 };
const PAGE_INSETS: Insets = { top: HUD_HEIGHT, right: 36, bottom: 36, left: RAIL.left + RAIL.width + 40 };
const GLOW_MARGIN = 64;
const DESK_DEPTH = 360;
const SWITCH_MS = 250;

export interface RoomCallbacks {
  onCardClick(key: number | 'plus'): void;
  onCardClose(key: number): void;
}

export interface RoomOptions {
  tiltDeg: number;
  fovDeg?: number;
  callbacks: RoomCallbacks;
}

interface Pose {
  position: Vector3;
  rotation: Euler;
  scale: number;
}

interface Tween {
  object: Object3D;
  from: Pose;
  to: () => Pose;
  start: number;
  duration: number;
  done?: () => void;
}

interface ViewEntry {
  view: TabView;
  object: CSS3DObject;
}

/**
 * The 3D room: a WebGL scene (floor, desk, glow, tab cards) with the
 * focused page placed on top by the CSS 3D renderer, seen from a fixed
 * desk camera with a small pointer parallax.
 *
 * Frames are drawn only while something changes (a resize, the camera
 * moving, a switch animation, a card spinner), so an idle room costs
 * nothing.
 */
export class Room {
  /** Frames drawn so far; read by the idle-efficiency check (C9). */
  frames = 0;
  readonly parallax = new Parallax();
  private readonly webgl: WebGLRenderer;
  private readonly css: CSS3DRenderer;
  private readonly cameraElement: HTMLElement;
  private readonly scene = new Scene();
  private readonly cssScene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly glow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly desk: Mesh<BoxGeometry, MeshStandardMaterial>;
  private readonly grid: GridHelper;
  private readonly views = new Map<number, ViewEntry>();
  private readonly cards = new Map<number | 'plus', TabCard>();
  private order: (number | 'plus')[] = [];
  private focusedId = -1;
  private railScroll = 0;
  private tweens: Tween[] = [];
  private currentLayout!: PanelLayout;
  private arc!: TabArcLayout;
  private framePending = false;
  private lastFrameTime = 0;
  private hoveredCard: TabCard | null = null;
  /** The last few parallax decisions, for diagnosing test failures. */
  readonly pointerLog: { x: number; y: number; target: string; overPage: boolean }[] = [];
  private readonly raycaster = new Raycaster();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    container: HTMLElement,
    private readonly theme: Theme,
    private readonly options: RoomOptions,
  ) {
    this.webgl = new WebGLRenderer({ antialias: true, alpha: true });
    this.webgl.setPixelRatio(window.devicePixelRatio);
    this.webgl.setClearColor(0x000000, 0);
    container.append(this.webgl.domElement);

    this.css = new CSS3DRenderer();
    this.css.domElement.classList.add('hs-css-layer');
    container.append(this.css.domElement);
    // CSS3DRenderer nests: domElement > view element > camera element. Pages
    // go straight into the camera element, where the renderer keeps them;
    // anywhere else it moves them on the first frame, and a moved webview
    // is destroyed and loads its page again.
    this.cameraElement = this.css.domElement.firstElementChild!.firstElementChild as HTMLElement;

    this.camera = new PerspectiveCamera(options.fovDeg ?? 40, 1, 1, 20000);

    const c = theme.colors;
    this.scene.fog = new Fog(new Color(c.backgroundBottom), 1500, 6000);
    const ambient = new AmbientLight(new Color(theme.lighting.ambient.color), theme.lighting.ambient.intensity);
    const key = new DirectionalLight(new Color(theme.lighting.key.color), theme.lighting.key.intensity);
    key.position.set(-400, 900, 800);
    this.scene.add(ambient, key);

    this.grid = new GridHelper(8000, 80, new Color(c.floorGrid), new Color(c.floorGrid));
    this.scene.add(this.grid);

    this.desk = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: new Color(c.desk), roughness: 0.6, metalness: 0.2 }),
    );
    this.scene.add(this.desk);

    this.glow = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        color: new Color(c.accent),
        map: makeGlowTexture(),
        transparent: true,
        opacity: theme.glowStrength,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.scene.add(this.glow);

    this.layout();
    window.addEventListener('resize', () => {
      this.layout();
      this.requestRender();
    });
    this.wirePointer();
    this.requestRender();
  }

  get layoutInfo(): PanelLayout {
    return this.currentLayout;
  }

  get animating(): boolean {
    return this.tweens.length > 0;
  }

  get rail(): { scroll: number; maxScroll: number; fits: number } {
    return { scroll: this.arc.scroll, maxScroll: this.arc.maxScroll, fits: this.arc.fits };
  }

  // ---- Tabs ---------------------------------------------------------------

  /** Adds a tab's view to the room, hidden until focused. */
  addView(view: TabView): void {
    const object = new CSS3DObject(view.element);
    view.setSize(this.currentLayout.panelWidth, this.currentLayout.panelHeight);
    this.applyPose(object, this.centrePose());
    this.setShown(view.element, false);
    // In the page now, so a background tab's webview attaches and loads.
    this.cameraElement.append(view.element);
    this.cssScene.add(object);
    this.views.set(view.tabId, { view, object });
  }

  /** Removes a closed tab's view; its webview and page go with it. */
  removeView(tabId: number): void {
    const entry = this.views.get(tabId);
    if (!entry) return;
    this.tweens = this.tweens.filter((t) => t.object !== entry.object);
    this.cssScene.remove(entry.object);
    entry.view.dispose();
    this.views.delete(tabId);
    this.requestRender();
  }

  /** Cards in order; the "+" card is added at the end. */
  setCards(models: CardModel[]): void {
    const all: CardModel[] = [...models, { key: 'plus', title: 'New tab', loading: false, focused: false }];
    const keys = new Set(all.map((m) => m.key));
    for (const [key, card] of this.cards) {
      if (!keys.has(key)) {
        this.scene.remove(card.mesh);
        card.dispose();
        this.cards.delete(key);
        if (this.hoveredCard === card) this.hoveredCard = null;
      }
    }
    for (const model of all) {
      const card = this.cards.get(model.key);
      if (card) card.update(model);
      else {
        const created = new TabCard(model, this.theme, () => this.requestRender());
        this.cards.set(model.key, created);
        this.scene.add(created.mesh);
      }
    }
    this.order = all.map((m) => m.key);
    this.layoutCards();
    this.requestRender();
  }

  setSnapshot(tabId: number, dataUrl: string): void {
    this.cards.get(tabId)?.setSnapshot(dataUrl);
  }

  hasSnapshot(tabId: number): boolean {
    return this.cards.get(tabId)?.hasSnapshot ?? false;
  }

  /**
   * Shows a tab's page in the centre. With animate, it grows out of its
   * card while the previous page shrinks back into its own card.
   */
  focus(tabId: number, animate: boolean): void {
    const previous = this.focusedId;
    this.focusedId = tabId;
    this.railScroll = scrollToShow(this.arcInput(), this.order.indexOf(tabId));
    this.layoutCards();
    const duration = animate && !this.reducedMotion.matches ? SWITCH_MS : 0;

    const next = this.views.get(tabId);
    if (next) {
      this.tweens = this.tweens.filter((t) => t.object !== next.object);
      this.setShown(next.view.element, true);
      if (duration > 0 && previous !== tabId) {
        this.applyPose(next.object, this.cardPose(tabId));
        this.addTween(next.object, () => this.centrePose(), duration);
      } else {
        this.applyPose(next.object, this.centrePose());
      }
    }
    const old = previous === tabId ? undefined : this.views.get(previous);
    if (old) {
      this.tweens = this.tweens.filter((t) => t.object !== old.object);
      const hide = () => {
        if (this.focusedId !== previous) this.setShown(old.view.element, false);
      };
      if (duration > 0) this.addTween(old.object, () => this.cardPose(previous), duration, hide);
      else hide();
    }
    this.requestRender();
  }

  // ---- Layout -------------------------------------------------------------

  /** Recomputes sizes after a resize or tilt change. */
  layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.currentLayout = computePanelLayout({
      viewportWidth: w,
      viewportHeight: h,
      fovDeg: this.options.fovDeg ?? 40,
      tiltDeg: this.options.tiltDeg,
      insets: PAGE_INSETS,
    });
    const layout = this.currentLayout;

    this.webgl.setSize(w, h);
    this.css.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = layout.fovDeg;
    this.camera.updateProjectionMatrix();
    this.applyCamera();

    for (const { view, object } of this.views.values()) {
      view.setSize(layout.panelWidth, layout.panelHeight);
      if (!this.tweens.some((t) => t.object === object)) this.applyPose(object, this.centrePose());
    }

    // Desk slab under the page; floor grid further down.
    const bottom = layout.position.y - layout.panelHeight / 2;
    this.desk.scale.set(layout.panelWidth * 1.1, 14, DESK_DEPTH);
    this.desk.rotation.set(0, layout.rotationY, 0);
    this.desk.position.set(layout.position.x, bottom - 22, layout.position.z + DESK_DEPTH / 2 - 60);
    this.grid.position.set(0, bottom - 120, 0);

    this.layoutCards();
  }

  private arcInput(): TabArcInput {
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      rail: {
        left: RAIL.left,
        top: HUD_HEIGHT,
        width: RAIL.width,
        bottom: window.innerHeight - RAIL.bottomMargin,
      },
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      gap: RAIL.gap,
      count: Math.max(1, this.order.length),
      scroll: this.railScroll,
      // The "+" card (always last) stays in view (owner, prompt 20).
      pinLast: true,
    };
  }

  private layoutCards(): void {
    this.railScroll = clampScroll(this.arcInput(), this.railScroll);
    this.arc = computeTabArc(this.arcInput());
    this.order.forEach((key, i) => {
      const card = this.cards.get(key);
      const place = this.arc.cards[i];
      if (!card || !place) return;
      card.mesh.position.set(place.position.x, place.position.y, place.position.z);
      card.mesh.rotation.set(place.rotationX, place.rotationY, 0);
      card.setOpacity(place.opacity);
    });
  }

  private centrePose(): Pose {
    const l = this.currentLayout;
    return {
      position: new Vector3(l.position.x, l.position.y, l.position.z),
      rotation: new Euler(0, l.rotationY, 0),
      scale: 1,
    };
  }

  private cardPose(key: number): Pose {
    const card = this.cards.get(key);
    const scale = CARD_WIDTH / Math.max(1, this.currentLayout.panelWidth);
    if (!card) return { ...this.centrePose(), scale };
    return { position: card.mesh.position.clone(), rotation: card.mesh.rotation.clone(), scale };
  }

  private applyPose(object: Object3D, pose: Pose): void {
    object.position.copy(pose.position);
    object.rotation.copy(pose.rotation);
    object.scale.setScalar(pose.scale);
  }

  private setShown(element: HTMLElement, shown: boolean): void {
    // Hidden, not removed: a webview that leaves the page reloads.
    element.style.visibility = shown ? '' : 'hidden';
    element.style.pointerEvents = shown ? '' : 'none';
    element.setAttribute('aria-hidden', shown ? 'false' : 'true');
  }

  private addTween(object: Object3D, to: () => Pose, duration: number, done?: () => void): void {
    const from: Pose = {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.x,
    };
    this.tweens.push({ object, from, to, start: performance.now(), duration, ...(done ? { done } : {}) });
  }

  // ---- Rendering ----------------------------------------------------------

  requestRender(): void {
    if (this.framePending) return;
    this.framePending = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(time: number): void {
    this.framePending = false;
    const dt = this.lastFrameTime === 0 ? 16 : Math.min(50, time - this.lastFrameTime);
    this.lastFrameTime = time;

    const moving = this.parallax.step(dt);
    this.stepTweens(performance.now());
    let spinning = false;
    for (const card of this.cards.values()) {
      if (card.spinning) {
        card.tick(dt);
        spinning = true;
      }
    }
    this.applyCamera();
    this.placeGlow();
    this.webgl.render(this.scene, this.camera);
    this.css.render(this.cssScene, this.camera);
    this.frames += 1;
    if (moving || this.tweens.length > 0 || spinning) this.requestRender();
    else this.lastFrameTime = 0;
  }

  private stepTweens(now: number): void {
    if (this.tweens.length === 0) return;
    const finished: Tween[] = [];
    for (const t of this.tweens) {
      const k = Math.min(1, (now - t.start) / t.duration);
      const e = 1 - (1 - k) ** 3; // ease out
      const to = t.to();
      t.object.position.lerpVectors(t.from.position, to.position, e);
      t.object.rotation.set(
        t.from.rotation.x + (to.rotation.x - t.from.rotation.x) * e,
        t.from.rotation.y + (to.rotation.y - t.from.rotation.y) * e,
        t.from.rotation.z + (to.rotation.z - t.from.rotation.z) * e,
      );
      t.object.scale.setScalar(t.from.scale + (to.scale - t.from.scale) * e);
      if (k >= 1) finished.push(t);
    }
    this.tweens = this.tweens.filter((t) => !finished.includes(t));
    for (const t of finished) t.done?.();
  }

  private applyCamera(): void {
    const { x, y } = this.parallax.offset;
    this.camera.position.set(x, y, this.currentLayout.cameraZ);
    this.camera.lookAt(0, 0, 0);
  }

  /** The glow sits just behind the focused page, following it as it moves. */
  private placeGlow(): void {
    const entry = this.views.get(this.focusedId);
    if (!entry) {
      this.glow.visible = false;
      return;
    }
    const { object } = entry;
    const l = this.currentLayout;
    const s = object.scale.x;
    this.glow.visible = true;
    this.glow.scale.set((l.panelWidth + GLOW_MARGIN * 2) * s, (l.panelHeight + GLOW_MARGIN * 2) * s, 1);
    this.glow.rotation.copy(object.rotation);
    const back = new Vector3(0, 0, -4).applyEuler(object.rotation);
    this.glow.position.copy(object.position).add(back);
  }

  // ---- Geometry for input and tests --------------------------------------

  private project(world: Vector3): Vec2 {
    const p = world.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  /** Where a point on the focused page (page pixels from its top-left) is on screen now. */
  projectPagePoint(u: number, v: number): Vec2 {
    const entry = this.views.get(this.focusedId);
    const { panelWidth: w, panelHeight: h } = this.currentLayout;
    if (!entry) return { x: Number.NaN, y: Number.NaN };
    entry.object.updateMatrixWorld();
    return this.project(entry.object.localToWorld(new Vector3(u - w / 2, h / 2 - v, 0)));
  }

  /** The focused page's outline on screen: top-left, top-right, bottom-right, bottom-left. */
  screenQuad(): Vec2[] {
    const { panelWidth: w, panelHeight: h } = this.currentLayout;
    return [
      this.projectPagePoint(0, 0),
      this.projectPagePoint(w, 0),
      this.projectPagePoint(w, h),
      this.projectPagePoint(0, h),
    ];
  }

  /** Screen point of part of a card, or null if the card is not showing. */
  cardPoint(key: number | 'plus', part: CardPart): Vec2 | null {
    const card = this.cards.get(key);
    if (!card || !card.mesh.visible) return null;
    const local = TabCard.localPoint(part);
    card.mesh.updateMatrixWorld();
    return this.project(card.mesh.localToWorld(new Vector3(local.x, local.y, 0)));
  }

  /** The colours the 3D materials actually use, as #rrggbb (for check C1). */
  sceneColors(): Record<string, string> {
    // The grid draws with per-vertex colours; its material stays white.
    const gridColors = this.grid.geometry.getAttribute('color');
    const gridColor = new Color().fromBufferAttribute(gridColors as BufferAttribute, 0);
    return {
      accent: `#${this.glow.material.color.getHexString()}`,
      desk: `#${this.desk.material.color.getHexString()}`,
      floorGrid: `#${gridColor.getHexString()}`,
    };
  }

  // ---- Pointer ------------------------------------------------------------

  private cardAt(x: number, y: number): { card: TabCard; part: CardPart } | null {
    const ndc = new Vector2((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [...this.cards.values()].map((c) => c.mesh).filter((m) => m.visible);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit?.uv) return null;
    const card = hit.object.userData['card'] as TabCard;
    return { card, part: card.partAt(hit.uv.x, hit.uv.y) };
  }

  private setHovered(hit: { card: TabCard; part: CardPart } | null): void {
    let changed = false;
    if (this.hoveredCard && this.hoveredCard !== hit?.card) {
      changed = this.hoveredCard.setHover(false, false) || changed;
    }
    this.hoveredCard = hit?.card ?? null;
    if (hit) changed = hit.card.setHover(true, hit.part === 'close') || changed;
    this.webgl.domElement.style.cursor = hit ? 'pointer' : '';
    if (changed) this.requestRender();
  }

  /**
   * Parallax follows the pointer over the room and pauses over the page,
   * so click targets never move under the cursor. Cards react to hover,
   * clicks, and the mouse wheel.
   */
  private wirePointer(): void {
    const canvas = this.webgl.domElement;
    const focusedElement = () => this.views.get(this.focusedId)?.view.element;
    const overPage = (x: number, y: number, target: EventTarget | null): boolean => {
      const el = focusedElement();
      if (!el) return false;
      return (target instanceof Node && el.contains(target)) || pointInPolygon({ x, y }, this.screenQuad());
    };

    document.addEventListener('pointermove', (e) => {
      const over = overPage(e.clientX, e.clientY, e.target);
      const t = e.target instanceof Element ? e.target : null;
      this.pointerLog.push({
        x: Math.round(e.clientX),
        y: Math.round(e.clientY),
        target: t ? `${t.tagName.toLowerCase()}${t.className && typeof t.className === 'string' ? `.${t.className}` : ''}` : String(e.target),
        overPage: over,
      });
      if (this.pointerLog.length > 20) this.pointerLog.shift();
      if (over) {
        this.parallax.setPaused(true);
        this.setHovered(null);
        return;
      }
      this.parallax.setPaused(false);
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = 1 - (e.clientY / window.innerHeight) * 2;
      this.parallax.setPointer(nx, ny);
      this.setHovered(e.target === canvas ? this.cardAt(e.clientX, e.clientY) : null);
      if (this.parallax.moving) this.requestRender();
    });
    document.addEventListener('pointerover', (e) => {
      const el = focusedElement();
      if (el && e.target instanceof Node && el.contains(e.target)) this.parallax.setPaused(true);
    });
    canvas.addEventListener('pointerleave', () => this.setHovered(null));

    canvas.addEventListener('click', (e) => {
      const hit = this.cardAt(e.clientX, e.clientY);
      if (!hit) return;
      if (hit.part === 'close' && hit.card.key !== 'plus') this.options.callbacks.onCardClose(hit.card.key);
      else this.options.callbacks.onCardClick(hit.card.key);
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        if (e.clientX > RAIL.left + RAIL.width + 24) return;
        const before = this.railScroll;
        this.railScroll = clampScroll(this.arcInput(), this.railScroll + e.deltaY);
        if (this.railScroll === before) return;
        this.layoutCards();
        this.setHovered(this.cardAt(e.clientX, e.clientY));
        this.requestRender();
      },
      { passive: true },
    );
  }
}

/** A soft rectangle that fades to transparent at the edges, for the glow. */
function makeGlowTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const edge = size * 0.18;
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.min(x, y, size - 1 - x, size - 1 - y);
        const a = Math.min(1, d / edge);
        const i = (y * size + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(255 * a * a);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  return new CanvasTexture(canvas);
}
