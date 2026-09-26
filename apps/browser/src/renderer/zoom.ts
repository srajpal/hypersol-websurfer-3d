/**
 * Zoom steps (milestone 8), as browsers offer them: 25% to 500%. Pure,
 * so the unit tests can check them.
 */
export const ZOOM_STEPS: readonly number[] = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

/** The next step in a direction from any factor (a factor between steps goes to the nearest one that way). */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((s) => s > current + 0.001) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < current - 0.001) ?? MIN_ZOOM;
}

/** 1.25 -> "125%". */
export function zoomLabel(factor: number): string {
  return `${Math.round(factor * 100)}%`;
}
