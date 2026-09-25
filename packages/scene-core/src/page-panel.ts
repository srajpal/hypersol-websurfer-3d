/**
 * A web page shown in the 3D room. Milestone 1 has one implementation, a
 * live panel (a Chromium view placed with CSS 3D transforms). The texture
 * panel (offscreen rendering onto a 3D surface) is the later upgrade path
 * and implements the same interface.
 */

export type PageState = 'loading' | 'loaded' | 'failed' | 'crashed';

export interface PageStatus {
  state: PageState;
  url: string;
  title?: string;
  /** Plain-language reason, for failed and crashed states. */
  message?: string;
}

export interface PagePanel {
  readonly kind: 'live' | 'texture';
  /** Current size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  load(url: string): void;
  reload(): void;
  setSize(width: number, height: number): void;
  onStatus(listener: (status: PageStatus) => void): () => void;
  dispose(): void;
}
