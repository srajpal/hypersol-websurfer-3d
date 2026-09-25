import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
  type BufferAttribute,
} from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import {
  Parallax,
  computePanelLayout,
  pointInPolygon,
  type Insets,
  type PanelLayout,
  type Vec2,
} from '@hypersol/scene-core';
import type { Theme } from '@hypersol/themes';
import type { LivePanel } from './live-panel';

export interface RoomOptions {
  tiltDeg: number;
  insets: Insets;
  fovDeg?: number;
}

const GLOW_MARGIN = 64;
const DESK_DEPTH = 360;

/**
 * The 3D room: a WebGL scene (floor, desk, glow, lights) with the live
 * page placed on top by the CSS 3D renderer, seen from a fixed desk
 * camera with a small pointer parallax.
 *
 * Frames are drawn only when something changes (a resize or the camera
 * moving), so the room costs nothing while idle.
 */
export class Room {
  /** Frames drawn so far; read by the idle-efficiency check (C9). */
  frames = 0;
  readonly parallax = new Parallax();
  private readonly webgl: WebGLRenderer;
  private readonly css: CSS3DRenderer;
  private readonly scene = new Scene();
  private readonly cssScene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly panelObject: CSS3DObject;
  private readonly glow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly desk: Mesh<BoxGeometry, MeshStandardMaterial>;
  private readonly grid: GridHelper;
  private readonly ambient: AmbientLight;
  private readonly keyLight: DirectionalLight;
  private currentLayout!: PanelLayout;
  private framePending = false;
  private lastFrameTime = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly panel: LivePanel,
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

    this.camera = new PerspectiveCamera(options.fovDeg ?? 40, 1, 1, 20000);

    const c = theme.colors;
    this.scene.fog = new Fog(new Color(c.backgroundBottom), 1500, 6000);

    this.ambient = new AmbientLight(new Color(theme.lighting.ambient.color), theme.lighting.ambient.intensity);
    this.keyLight = new DirectionalLight(new Color(theme.lighting.key.color), theme.lighting.key.intensity);
    this.keyLight.position.set(-400, 900, 800);
    this.scene.add(this.ambient, this.keyLight);

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

    this.panelObject = new CSS3DObject(panel.element);
    this.cssScene.add(this.panelObject);

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

  /** Recomputes sizes after a resize or tilt change. */
  layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const layout = computePanelLayout({
      viewportWidth: w,
      viewportHeight: h,
      fovDeg: this.options.fovDeg ?? 40,
      tiltDeg: this.options.tiltDeg,
      insets: this.options.insets,
    });
    this.currentLayout = layout;

    this.webgl.setSize(w, h);
    this.css.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = layout.fovDeg;
    this.camera.updateProjectionMatrix();
    this.applyCamera();

    this.panel.setSize(layout.panelWidth, layout.panelHeight);
    this.panelObject.position.set(layout.position.x, layout.position.y, layout.position.z);
    this.panelObject.rotation.set(0, layout.rotationY, 0);

    // Glow sits just behind the page, a little larger than it.
    this.glow.scale.set(layout.panelWidth + GLOW_MARGIN * 2, layout.panelHeight + GLOW_MARGIN * 2, 1);
    this.glow.rotation.set(0, layout.rotationY, 0);
    const back = new Vector3(0, 0, -4).applyEuler(this.glow.rotation);
    this.glow.position.set(layout.position.x + back.x, layout.position.y, layout.position.z + back.z);

    // Desk slab under the page; floor grid further down.
    const bottom = layout.position.y - layout.panelHeight / 2;
    this.desk.scale.set(layout.panelWidth * 1.1, 14, DESK_DEPTH);
    this.desk.rotation.set(0, layout.rotationY, 0);
    this.desk.position.set(layout.position.x, bottom - 22, layout.position.z + DESK_DEPTH / 2 - 60);
    this.grid.position.set(0, bottom - 120, 0);
  }

  requestRender(): void {
    if (this.framePending) return;
    this.framePending = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Where a point on the page (page pixels from its top-left) is on screen now. */
  projectPagePoint(u: number, v: number): Vec2 {
    const { panelWidth: w, panelHeight: h } = this.currentLayout;
    this.panelObject.updateMatrixWorld();
    const p = this.panelObject.localToWorld(new Vector3(u - w / 2, h / 2 - v, 0));
    p.project(this.camera);
    return {
      x: ((p.x + 1) / 2) * window.innerWidth,
      y: ((1 - p.y) / 2) * window.innerHeight,
    };
  }

  /** The page's outline on screen: top-left, top-right, bottom-right, bottom-left. */
  screenQuad(): Vec2[] {
    const { panelWidth: w, panelHeight: h } = this.currentLayout;
    return [
      this.projectPagePoint(0, 0),
      this.projectPagePoint(w, 0),
      this.projectPagePoint(w, h),
      this.projectPagePoint(0, h),
    ];
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

  private applyCamera(): void {
    const { x, y } = this.parallax.offset;
    this.camera.position.set(x, y, this.currentLayout.cameraZ);
    this.camera.lookAt(0, 0, 0);
  }

  private frame(time: number): void {
    this.framePending = false;
    const dt = this.lastFrameTime === 0 ? 16 : Math.min(50, time - this.lastFrameTime);
    this.lastFrameTime = time;
    const moving = this.parallax.step(dt);
    this.applyCamera();
    this.webgl.render(this.scene, this.camera);
    this.css.render(this.cssScene, this.camera);
    this.frames += 1;
    if (moving) this.requestRender();
    else this.lastFrameTime = 0;
  }

  /**
   * Parallax follows the pointer over the room and pauses over the page,
   * so click targets never move under the cursor.
   */
  private wirePointer(): void {
    const overPage = (x: number, y: number, target: EventTarget | null): boolean =>
      (target instanceof Node && this.panel.element.contains(target)) ||
      pointInPolygon({ x, y }, this.screenQuad());

    document.addEventListener('pointermove', (e) => {
      if (overPage(e.clientX, e.clientY, e.target)) {
        this.parallax.setPaused(true);
        return;
      }
      this.parallax.setPaused(false);
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = 1 - (e.clientY / window.innerHeight) * 2;
      this.parallax.setPointer(nx, ny);
      if (this.parallax.moving) this.requestRender();
    });
    // The page is a separate Chromium view: once the pointer is inside it,
    // the shell stops seeing moves, so pause as soon as it enters.
    this.panel.element.addEventListener('pointerover', () => this.parallax.setPaused(true));
    this.panel.view.addEventListener('mouseover', () => this.parallax.setPaused(true));
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
        const alpha = Math.round(255 * a * a);
        const i = (y * size + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = alpha;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  return new CanvasTexture(canvas);
}
