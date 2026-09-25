import { describe, expect, it } from 'vitest';
import {
  builtInThemes,
  cssVarName,
  hexToNumber,
  nebula,
  numberToHex,
  threeColor,
  toCssVariables,
  validateTheme,
  type ColorToken,
} from './index.js';

describe('theme tokens', () => {
  it('names CSS variables from token names', () => {
    expect(cssVarName('accent')).toBe('--hs-accent');
    expect(cssVarName('backgroundTop')).toBe('--hs-background-top');
    expect(cssVarName('textMuted')).toBe('--hs-text-muted');
  });

  it('converts hex both ways without loss', () => {
    expect(hexToNumber('#5ce1ff')).toBe(0x5ce1ff);
    expect(numberToHex(0x5ce1ff)).toBe('#5ce1ff');
    expect(numberToHex(0)).toBe('#000000');
    expect(() => hexToNumber('#fff')).toThrow();
    expect(() => hexToNumber('red')).toThrow();
    expect(() => numberToHex(0x1000000)).toThrow();
  });

  it('gives matching CSS and 3D colours for every token of every built-in theme', () => {
    for (const theme of builtInThemes) {
      const vars = toCssVariables(theme);
      for (const token of Object.keys(theme.colors) as ColorToken[]) {
        const css = vars[cssVarName(token)];
        expect(css, `${theme.id}.${token}`).toBeDefined();
        expect(hexToNumber(css!)).toBe(threeColor(theme, token));
      }
    }
  });

  it('built-in themes are valid', () => {
    for (const theme of builtInThemes) {
      expect(validateTheme(theme)).toEqual([]);
    }
  });

  it('reports invalid values', () => {
    const broken = {
      ...nebula,
      glowStrength: 2,
      colors: { ...nebula.colors, accent: 'cyan' },
    };
    const problems = validateTheme(broken);
    expect(problems).toContain('colors.accent is not #rrggbb: cyan');
    expect(problems).toContain('glowStrength must be between 0 and 1');
  });
});
