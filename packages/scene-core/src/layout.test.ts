import { describe, expect, it } from 'vitest';
import {
  clampTilt,
  computePanelLayout,
  panelPointToWorld,
  panelScreenQuad,
  pixelPerfectDistance,
  pointInPolygon,
  projectToViewport,
  type LayoutInput,
} from './layout.js';

const insets = { top: 56, right: 40, bottom: 40, left: 40 };
const base: LayoutInput = {
  viewportWidth: 1280,
  viewportHeight: 800,
  fovDeg: 40,
  tiltDeg: 0,
  insets,
};

describe('clampTilt', () => {
  it('keeps tilt between 0 and 20 degrees', () => {
    expect(clampTilt(-5)).toBe(0);
    expect(clampTilt(10)).toBe(10);
    expect(clampTilt(45)).toBe(20);
    expect(clampTilt(Number.NaN)).toBe(10);
  });
});

describe('computePanelLayout', () => {
  it('at 0 degrees fills the free area at exactly 1:1', () => {
    const layout = computePanelLayout(base);
    expect(layout.panelWidth).toBe(1280 - 80);
    expect(layout.panelHeight).toBe(800 - 96);
    const [tl, tr, br, bl] = panelScreenQuad(layout);
    expect(tl!.x).toBeCloseTo(40, 6);
    expect(tl!.y).toBeCloseTo(56, 6);
    expect(tr!.x).toBeCloseTo(1240, 6);
    expect(br!.y).toBeCloseTo(760, 6);
    expect(bl!.x).toBeCloseTo(40, 6);
  });

  it('places the camera where one world unit is one pixel', () => {
    const layout = computePanelLayout(base);
    expect(layout.cameraZ).toBeCloseTo(pixelPerfectDistance(800, 40), 9);
    const a = projectToViewport(layout, { x: 0, y: 0, z: 0 });
    const b = projectToViewport(layout, { x: 100, y: 0, z: 0 });
    expect(b.x - a.x).toBeCloseTo(100, 9);
  });

  for (const tiltDeg of [10, 20]) {
    it(`at ${tiltDeg} degrees keeps every corner inside the free area, tightly`, () => {
      const layout = computePanelLayout({ ...base, tiltDeg });
      const quad = panelScreenQuad(layout);
      for (const p of quad) {
        expect(p.x).toBeGreaterThanOrEqual(40 - 0.5);
        expect(p.x).toBeLessThanOrEqual(1240 + 0.5);
        expect(p.y).toBeGreaterThanOrEqual(56 - 0.5);
        expect(p.y).toBeLessThanOrEqual(760 + 0.5);
      }
      // Tight: some corner reaches within 2 px of a boundary.
      const gaps = quad.flatMap((p) => [p.x - 40, 1240 - p.x, p.y - 56, 760 - p.y]);
      expect(Math.min(...gaps)).toBeLessThan(2);
    });
  }

  it('turns the right edge away and brings the left edge nearer', () => {
    const layout = computePanelLayout({ ...base, tiltDeg: 10 });
    const left = panelPointToWorld(layout, 0, 0);
    const right = panelPointToWorld(layout, layout.panelWidth, 0);
    expect(left.z).toBeGreaterThan(0);
    expect(right.z).toBeLessThan(0);
    const [tl, tr, br, bl] = panelScreenQuad(layout);
    const leftHeight = bl!.y - tl!.y;
    const rightHeight = br!.y - tr!.y;
    expect(leftHeight).toBeGreaterThan(rightHeight);
  });

  it('shrinks more as the tilt grows', () => {
    const w0 = computePanelLayout({ ...base, tiltDeg: 0 }).panelWidth;
    const w10 = computePanelLayout({ ...base, tiltDeg: 10 }).panelWidth;
    const w20 = computePanelLayout({ ...base, tiltDeg: 20 }).panelWidth;
    expect(w10).toBeLessThan(w0);
    expect(w20).toBeLessThan(w10);
  });

  it('keeps the page centred in the free area', () => {
    const layout = computePanelLayout(base);
    // Free area centre is 8 px below the viewport centre (56 top vs 40 bottom).
    expect(layout.position.x).toBeCloseTo(0, 9);
    expect(layout.position.y).toBeCloseTo(-8, 9);
  });

  it('works for a small window', () => {
    const layout = computePanelLayout({ ...base, viewportWidth: 800, viewportHeight: 600, tiltDeg: 20 });
    expect(layout.panelWidth).toBeGreaterThan(300);
    expect(layout.panelHeight).toBeGreaterThan(200);
  });
});

describe('projection matches a plain pinhole camera', () => {
  it('projects points in front of the page plane larger', () => {
    const layout = computePanelLayout(base);
    const near = projectToViewport(layout, { x: 100, y: 0, z: 100 });
    const far = projectToViewport(layout, { x: 100, y: 0, z: -100 });
    const centre = layout.viewportWidth / 2;
    expect(near.x - centre).toBeGreaterThan(100);
    expect(far.x - centre).toBeLessThan(100);
    const expected = (100 * layout.cameraZ) / (layout.cameraZ - 100);
    expect(near.x - centre).toBeCloseTo(expected, 9);
  });

  it('moves the image against a camera offset', () => {
    const layout = computePanelLayout(base);
    const still = projectToViewport(layout, { x: 0, y: 0, z: 0 });
    const moved = projectToViewport(layout, { x: 0, y: 0, z: 0 }, { x: 10, y: 5 });
    expect(moved.x).toBeCloseTo(still.x - 10, 9);
    expect(moved.y).toBeCloseTo(still.y + 5, 9);
  });

  it('refuses points behind the camera', () => {
    const layout = computePanelLayout(base);
    expect(() => projectToViewport(layout, { x: 0, y: 0, z: layout.cameraZ + 1 })).toThrow();
  });
});

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it('finds points inside and outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });
  it('works on a tilted page outline', () => {
    const quad = panelScreenQuad(computePanelLayout({ ...base, tiltDeg: 20 }));
    expect(pointInPolygon({ x: 640, y: 400 }, quad)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, quad)).toBe(false);
  });
});
