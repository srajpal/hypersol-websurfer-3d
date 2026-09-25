import type { ShortcutName } from '../shared/commands';

/** The fields of Electron's before-input-event input that shortcuts need. */
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * Maps a key press to a browser shortcut, or null. Ctrl on Windows and
 * Linux, Cmd on macOS; Ctrl+Tab on every platform, since Cmd+Tab is the
 * macOS app switcher.
 */
export function matchShortcut(input: KeyInput, platform: string): ShortcutName | null {
  if (input.type !== 'keyDown' && input.type !== 'rawKeyDown') return null;
  const mac = platform === 'darwin';
  const mod = mac ? input.meta : input.control;
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const plainMod = mod && !input.alt && !input.shift;

  if (input.control && key === 'Tab' && !input.alt) return input.shift ? 'prev-tab' : 'next-tab';
  if (mod && !input.alt && !input.shift && key === 'PageDown') return 'next-tab';
  if (mod && !input.alt && !input.shift && key === 'PageUp') return 'prev-tab';
  if (plainMod && key === 't') return 'new-tab';
  if (plainMod && key === 'w') return 'close-tab';
  if (plainMod && key === 'l') return 'focus-address';
  if (!mac && input.alt && !input.control && !input.shift && key === 'd') return 'focus-address';
  if ((plainMod && key === 'r') || (key === 'F5' && !mod && !input.alt && !input.shift)) return 'reload';
  if (mac) {
    if (plainMod && key === '[') return 'back';
    if (plainMod && key === ']') return 'forward';
  } else if (input.alt && !input.control && !input.shift && !input.meta) {
    if (key === 'ArrowLeft') return 'back';
    if (key === 'ArrowRight') return 'forward';
  }
  return null;
}
