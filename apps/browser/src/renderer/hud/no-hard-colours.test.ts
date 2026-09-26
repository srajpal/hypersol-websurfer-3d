import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * H8 (milestone 6): the shell's styles take every colour from the theme
 * (--hs-* variables), so switching themes changes everything together.
 * Two literal colours are deliberate: a web page's own default white
 * background, and the black of the scanlines, whose strength the theme
 * sets.
 */
const ALLOWED = ['background: #ffffff;', 'rgb(0 0 0 / calc(var(--hs-scanlines) * 100%))'];
const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;

describe('shell styles', () => {
  it('use theme colours only', () => {
    const dir = join(__dirname, '..');
    const files = ['styles.css', ...readdirSync(join(dir, 'hud')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => `hud/${f}`)];
    const found: string[] = [];
    for (const file of files) {
      readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (COLOUR.test(line) && !ALLOWED.some((a) => line.includes(a))) found.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });
});
