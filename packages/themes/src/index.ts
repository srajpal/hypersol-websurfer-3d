export type { ColorToken, LightSetting, Theme, ThemeColors } from './schema.js';
export {
  contrastRatio,
  cssVarName,
  hexToNumber,
  luminance,
  numberToHex,
  threeColor,
  toCssVariables,
  validateTheme,
} from './tokens.js';
export { daylight } from './daylight.js';
export { nebula } from './nebula.js';

import { daylight } from './daylight.js';
import { nebula } from './nebula.js';
import type { Theme } from './schema.js';

/** Built-in themes: Nebula (dark, the default) and Daylight (light). */
export const builtInThemes = [nebula, daylight] as const;
export const defaultTheme = nebula;

/** A built-in theme by id; the default for anything unknown. */
export function themeById(id: string): Theme {
  return builtInThemes.find((t) => t.id === id) ?? defaultTheme;
}
