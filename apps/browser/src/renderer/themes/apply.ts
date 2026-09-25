import { toCssVariables, type Theme } from '@hypersol/themes';

/** Writes a theme's values as CSS variables on an element (usually <html>). */
export function applyThemeCss(root: HTMLElement, theme: Theme): void {
  for (const [name, value] of Object.entries(toCssVariables(theme))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.scheme;
}
