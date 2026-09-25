import type { Theme } from './schema.js';

/**
 * Nebula: the dark default theme.
 * Provisional values for milestone 1. Final colours are decided in
 * milestone 6 (ARCHITECTURE.md open question 1).
 */
export const nebula: Theme = {
  id: 'nebula',
  name: 'Nebula',
  scheme: 'dark',
  colors: {
    backgroundTop: '#0b1026',
    backgroundBottom: '#03040c',
    panelGlass: '#1a2350',
    accent: '#5ce1ff',
    text: '#e6ecff',
    textMuted: '#8a94c2',
    floorGrid: '#24346e',
    desk: '#10163a',
  },
  glowStrength: 0.6,
  lighting: {
    ambient: { color: '#6b7bd6', intensity: 0.6 },
    key: { color: '#ffffff', intensity: 1.2 },
  },
};
