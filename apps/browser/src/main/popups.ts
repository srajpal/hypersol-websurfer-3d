/**
 * New-window rules (owner decision, prompt 19): a link or script that
 * asks for a new window opens a tab in front; Ctrl-click or middle-click
 * opens it behind. A page may only do this shortly after the person
 * clicked or typed in it; otherwise the request is blocked, like
 * Chromium's pop-up blocker. The window matches Chromium's transient
 * user activation (5 seconds).
 */
export const USER_ACTIVATION_MS = 5000;

export interface PopupDecision {
  allow: boolean;
  background: boolean;
}

/**
 * @param disposition Electron's window-open disposition.
 * @param msSinceGesture Time since the last click or key press in the
 *   page, or null if there has been none since it loaded.
 */
export function decidePopup(disposition: string, msSinceGesture: number | null): PopupDecision {
  const allow = msSinceGesture !== null && msSinceGesture >= 0 && msSinceGesture <= USER_ACTIVATION_MS;
  return { allow, background: disposition === 'background-tab' };
}

/** Input events that count as the person acting on the page. */
export const GESTURE_EVENTS = new Set(['mouseDown', 'rawKeyDown', 'keyDown', 'touchStart', 'gestureTap']);
