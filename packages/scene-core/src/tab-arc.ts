/**
 * Layout of the tab cards: a vertical rail on the left of the room where
 * cards sit on a shallow arc. Cards in the middle of the rail come
 * slightly toward the viewer; cards near the ends lean back. When there
 * are more cards than fit, the rail scrolls; cards keep their size.
 *
 * Positions are in world units, which equal CSS pixels at depth 0 (see
 * layout.ts). Screen y grows downward; world y grows upward.
 */
import { degToRad, type Vec3 } from './layout.js';

export interface TabArcInput {
  viewportWidth: number;
  viewportHeight: number;
  /** Rail edges in CSS pixels from the window's top-left corner. */
  rail: { left: number; top: number; width: number; bottom: number };
  cardWidth: number;
  cardHeight: number;
  gap: number;
  /** Number of cards, including the "+" card. */
  count: number;
  /** Scroll offset in pixels; 0 shows the first card at the top. */
  scroll: number;
  /** How far the middle of the arc comes toward the viewer. */
  depth?: number;
  /** Turn of each card toward the centre of the room, in degrees. */
  turnDeg?: number;
  /** Lean of the cards at the ends of the rail, in degrees. */
  leanDeg?: number;
}

export interface CardPlacement {
  index: number;
  position: Vec3;
  rotationX: number;
  rotationY: number;
  /** 1 when fully inside the rail, fading to 0 as it leaves. */
  opacity: number;
  visible: boolean;
}

export interface TabArcLayout {
  cards: CardPlacement[];
  scroll: number;
  maxScroll: number;
  /** How many whole cards fit in the rail. */
  fits: number;
}

export const DEFAULT_ARC = { depth: 36, turnDeg: 14, leanDeg: 8 } as const;

export function maxScroll(input: Pick<TabArcInput, 'rail' | 'cardHeight' | 'gap' | 'count'>): number {
  const railHeight = Math.max(0, input.rail.bottom - input.rail.top);
  const total = input.count * input.cardHeight + Math.max(0, input.count - 1) * input.gap;
  return Math.max(0, total - railHeight);
}

export function clampScroll(input: Pick<TabArcInput, 'rail' | 'cardHeight' | 'gap' | 'count'>, scroll: number): number {
  if (!Number.isFinite(scroll)) return 0;
  return Math.min(maxScroll(input), Math.max(0, scroll));
}

/** The scroll that brings card `index` fully into the rail, moving as little as possible. */
export function scrollToShow(input: TabArcInput, index: number): number {
  const top = index * (input.cardHeight + input.gap);
  const bottom = top + input.cardHeight;
  const railHeight = input.rail.bottom - input.rail.top;
  let scroll = input.scroll;
  if (top < scroll) scroll = top;
  else if (bottom > scroll + railHeight) scroll = bottom - railHeight;
  return clampScroll(input, scroll);
}

export function computeTabArc(input: TabArcInput): TabArcLayout {
  const depth = input.depth ?? DEFAULT_ARC.depth;
  const turn = degToRad(input.turnDeg ?? DEFAULT_ARC.turnDeg);
  const lean = degToRad(input.leanDeg ?? DEFAULT_ARC.leanDeg);
  const scroll = clampScroll(input, input.scroll);
  const { rail, cardHeight: h, gap } = input;
  const railHeight = Math.max(1, rail.bottom - rail.top);
  const railMid = rail.top + railHeight / 2;
  const x = rail.left + rail.width / 2 - input.viewportWidth / 2;

  const cards: CardPlacement[] = [];
  for (let i = 0; i < input.count; i++) {
    const screenY = rail.top + h / 2 + i * (h + gap) - scroll;
    // -1 at the top of the rail, 1 at the bottom.
    const t = Math.max(-1, Math.min(1, (screenY - railMid) / (railHeight / 2)));
    // Fade over half a card beyond each end of the rail.
    const above = rail.top - (screenY - h / 2);
    const below = screenY + h / 2 - rail.bottom;
    const outside = Math.max(above, below, 0);
    const opacity = Math.max(0, 1 - outside / (h / 2));
    cards.push({
      index: i,
      position: { x, y: input.viewportHeight / 2 - screenY, z: depth * (1 - t * t) },
      rotationX: t * lean,
      rotationY: turn,
      opacity,
      visible: opacity > 0,
    });
  }
  return {
    cards,
    scroll,
    maxScroll: maxScroll(input),
    fits: Math.max(1, Math.floor((railHeight + gap) / (h + gap))),
  };
}
