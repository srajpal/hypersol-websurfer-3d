import { describe, expect, it } from 'vitest';
import { decidePopup, USER_ACTIVATION_MS } from './popups';

describe('decidePopup', () => {
  it('opens in front after a click', () => {
    expect(decidePopup('foreground-tab', 50)).toEqual({ allow: true, background: false });
    expect(decidePopup('new-window', 50)).toEqual({ allow: true, background: false });
  });

  it('opens behind for Ctrl-click and middle-click', () => {
    expect(decidePopup('background-tab', 50)).toEqual({ allow: true, background: true });
  });

  it('blocks pages that never had a click or key press', () => {
    expect(decidePopup('foreground-tab', null).allow).toBe(false);
  });

  it('blocks once the click is too old', () => {
    expect(decidePopup('foreground-tab', USER_ACTIVATION_MS).allow).toBe(true);
    expect(decidePopup('foreground-tab', USER_ACTIVATION_MS + 1).allow).toBe(false);
    expect(decidePopup('foreground-tab', -1).allow).toBe(false);
  });
});
