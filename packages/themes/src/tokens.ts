import type { ColorToken, Theme } from './schema.js';

const HEX = /^#[0-9a-f]{6}$/i;

/** CSS variable name for a colour token, e.g. accent -> --hs-accent. */
export function cssVarName(token: ColorToken): string {
  return `--hs-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Parses "#rrggbb" into the 0xrrggbb number Three.js colours accept. */
export function hexToNumber(hex: string): number {
  if (!HEX.test(hex)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  return Number.parseInt(hex.slice(1), 16);
}

/** Formats a 0xrrggbb number back into "#rrggbb". */
export function numberToHex(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new Error(`Not a 24-bit colour: ${value}`);
  }
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * Every CSS variable a theme defines. Colours come straight from the
 * theme, so the HUD and the 3D room read the same values.
 */
export function toCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [token, hex] of Object.entries(theme.colors) as [ColorToken, string][]) {
    vars[cssVarName(token)] = hex.toLowerCase();
  }
  vars['--hs-glow-strength'] = String(theme.glowStrength);
  return vars;
}

/** The Three.js colour number for a token. */
export function threeColor(theme: Theme, token: ColorToken): number {
  return hexToNumber(theme.colors[token]);
}

/** Checks a theme's values; returns a list of problems (empty when valid). */
export function validateTheme(theme: Theme): string[] {
  const problems: string[] = [];
  for (const [token, hex] of Object.entries(theme.colors)) {
    if (!HEX.test(hex)) problems.push(`colors.${token} is not #rrggbb: ${hex}`);
  }
  for (const [name, light] of Object.entries(theme.lighting)) {
    if (!HEX.test(light.color)) problems.push(`lighting.${name}.color is not #rrggbb`);
    if (!(light.intensity >= 0)) problems.push(`lighting.${name}.intensity must be >= 0`);
  }
  if (!(theme.glowStrength >= 0 && theme.glowStrength <= 1)) {
    problems.push('glowStrength must be between 0 and 1');
  }
  return problems;
}
