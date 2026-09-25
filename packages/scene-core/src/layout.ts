/**
 * Room layout maths. World units equal CSS pixels at depth 0: the camera
 * sits at the distance where a panel facing it at z = 0 appears at exactly
 * its pixel size. That keeps an untilted page pixel-sharp.
 *
 * Axes follow Three.js: x right, y up, z toward the viewer.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInput {
  /** Window content size in CSS pixels. */
  viewportWidth: number;
  viewportHeight: number;
  /** Vertical field of view of the camera, in degrees. */
  fovDeg: number;
  /** Page tilt around the vertical axis, in degrees. Positive turns the right edge away. */
  tiltDeg: number;
  /** Space kept free around the page, in CSS pixels. */
  insets: Insets;
}

export interface PanelLayout {
  /** Page size in CSS pixels (and world units). */
  panelWidth: number;
  panelHeight: number;
  /** Centre of the page in world units. */
  position: Vec3;
  /** Rotation around the y axis, in radians. */
  rotationY: number;
  /** Camera distance from z = 0. */
  cameraZ: number;
  fovDeg: number;
  viewportWidth: number;
  viewportHeight: number;
}

export const MIN_TILT_DEG = 0;
export const MAX_TILT_DEG = 20;
export const DEFAULT_TILT_DEG = 10;

export function clampTilt(deg: number): number {
  if (!Number.isFinite(deg)) return DEFAULT_TILT_DEG;
  return Math.min(MAX_TILT_DEG, Math.max(MIN_TILT_DEG, deg));
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Camera distance at which one world unit at z = 0 is one CSS pixel. */
export function pixelPerfectDistance(viewportHeight: number, fovDeg: number): number {
  return viewportHeight / 2 / Math.tan(degToRad(fovDeg) / 2);
}

/** A point on the page, in page pixels from its top-left corner, to world space. */
export function panelPointToWorld(layout: PanelLayout, u: number, v: number): Vec3 {
  const lx = u - layout.panelWidth / 2;
  const ly = layout.panelHeight / 2 - v;
  const c = Math.cos(layout.rotationY);
  const s = Math.sin(layout.rotationY);
  return {
    x: layout.position.x + lx * c,
    y: layout.position.y + ly,
    z: layout.position.z - lx * s,
  };
}

/**
 * Projects a world point to viewport CSS pixels (origin top-left) for a
 * camera at (camera.x, camera.y, cameraZ) looking straight down -z.
 */
export function projectToViewport(
  layout: Pick<PanelLayout, 'cameraZ' | 'viewportWidth' | 'viewportHeight'>,
  p: Vec3,
  camera: Vec2 = { x: 0, y: 0 },
): Vec2 {
  const depth = layout.cameraZ - p.z;
  if (depth <= 0) throw new Error('Point is behind the camera');
  const k = layout.cameraZ / depth;
  return {
    x: layout.viewportWidth / 2 + (p.x - camera.x) * k,
    y: layout.viewportHeight / 2 - (p.y - camera.y) * k,
  };
}

/** The page's four corners on screen: top-left, top-right, bottom-right, bottom-left. */
export function panelScreenQuad(layout: PanelLayout, camera: Vec2 = { x: 0, y: 0 }): Vec2[] {
  const { panelWidth: w, panelHeight: h } = layout;
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return corners.map(([u, v]) => projectToViewport(layout, panelPointToWorld(layout, u, v), camera));
}

function build(input: LayoutInput, scale: number): PanelLayout {
  const { viewportWidth: vw, viewportHeight: vh, insets } = input;
  const availW = Math.max(1, vw - insets.left - insets.right);
  const availH = Math.max(1, vh - insets.top - insets.bottom);
  const cameraZ = pixelPerfectDistance(vh, input.fovDeg);
  // Centre of the free area, relative to the viewport centre, y up.
  const cx = insets.left + availW / 2 - vw / 2;
  const cy = vh / 2 - (insets.top + availH / 2);
  return {
    panelWidth: Math.round(availW * scale),
    panelHeight: Math.round(availH * scale),
    position: { x: cx, y: cy, z: 0 },
    rotationY: degToRad(clampTilt(input.tiltDeg)),
    cameraZ,
    fovDeg: input.fovDeg,
    viewportWidth: vw,
    viewportHeight: vh,
  };
}

function fitsFreeArea(input: LayoutInput, layout: PanelLayout): boolean {
  const { insets, viewportWidth: vw, viewportHeight: vh } = input;
  const eps = 0.5;
  return panelScreenQuad(layout).every(
    (p) =>
      p.x >= insets.left - eps &&
      p.x <= vw - insets.right + eps &&
      p.y >= insets.top - eps &&
      p.y <= vh - insets.bottom + eps,
  );
}

/**
 * Lays out the focused page: as large as the free area allows, centred in
 * it, tilted by tiltDeg, and shrunk just enough that the nearer edge,
 * which the tilt brings toward the camera, still fits.
 * At 0 degrees the page fills the free area at exactly 1:1.
 */
export function computePanelLayout(input: LayoutInput): PanelLayout {
  const full = build(input, 1);
  if (fitsFreeArea(input, full)) return full;
  let lo = 0.1;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fitsFreeArea(input, build(input, mid))) lo = mid;
    else hi = mid;
  }
  return build(input, lo);
}

/** Whether a point lies inside a polygon (even-odd rule). */
export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
