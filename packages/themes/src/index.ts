export type { ColorToken, LightSetting, Theme, ThemeColors } from './schema.js';
export {
  cssVarName,
  hexToNumber,
  numberToHex,
  threeColor,
  toCssVariables,
  validateTheme,
} from './tokens.js';
export { nebula } from './nebula.js';

import { nebula } from './nebula.js';

/** Built-in themes. Daylight joins in milestone 6. */
export const builtInThemes = [nebula] as const;
export const defaultTheme = nebula;
