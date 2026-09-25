/**
 * Layout of the tab cards: a vertical rail on the left of the room where
 * cards sit on a shallow arc. Cards in the middle of the rail come
 * slightly toward the viewer; cards near the ends lean back. When there
 * are more cards than fit, the rail scrolls; cards keep their size.
 * With pinLast, the last card (the "+" card) never scrolls away: it
 * follows the other cards while they fit, and stays at the bottom of the
 * rail once they overflow; the other cards scroll above it.
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
  /** Keep the last card in view at the bottom of the rail. */
  pinLast?: boolean;
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

type ScrollInput = Pick<TabArcInput, 'rail' | 'cardHeight' | 'gap' | 'count' | 'pinLast'>;

/** The part of the rail that scrolls, and how many cards scroll in it. */
function scrollArea(input: ScrollInput): { top: number; bottom: number; count: number } {
  const pinned = input.pinLast === true && input.count > 0;
  return {
    top: input.rail.top,
    bottom: pinned ? input.rail.bottom - input.cardHeight - input.gap : input.rail.bottom,
    count: pinned ? input.count - 1 : input.count,
  };
}

export function maxScroll(input: ScrollInput): number {
  const area = scrollArea(input);
  const height = Math.max(0, area.bottom - area.top);
  const total = area.count * input.cardHeight + Math.max(0, area.count - 1) * input.gap;
  return Math.max(0, total - height);
}

export function clampScroll(input: ScrollInput, scroll: number): number {
  if (!Number.isFinite(scroll)) return 0;
  return Math.min(maxScroll(input), Math.max(0, scroll));
}

/** The scroll that brings card `index` fully into the rail, moving as little as possible. */
export function scrollToShow(input: TabArcInput, index: number): number {
  const area = scrollArea(input);
  if (index >= area.count) return clampScroll(input, input.scroll); // the pinned card
  const top = index * (input.cardHeight + input.gap);
  const bottom = top + input.cardHeight;
  const height = area.bottom - area.top;
  let scroll = input.scroll;
  if (top < scroll) scroll = top;
  else if (bottom > scroll + height) scroll = bottom - height;
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

  const area = scrollArea(input);
  const cards: CardPlacement[] = [];
  for (let i = 0; i < input.count; i++) {
    const pinned = i >= area.count;
    const natural = rail.top + h / 2 + i * (h + gap) - scroll;
    // The pinned card follows the others but never goes below the rail.
    const screenY = pinned ? Math.min(natural, rail.bottom - h / 2) : natural;
    const areaBottom = pinned ? rail.bottom : area.bottom;
    // -1 at the top of the rail, 1 at the bottom.
    const t = Math.max(-1, Math.min(1, (screenY - railMid) / (railHeight / 2)));
    // Fade over half a card beyond each end of the rail.
    const above = rail.top - (screenY - h / 2);
    const below = screenY + h / 2 - areaBottom;
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
    fits: Math.max(1, Math.floor((area.bottom - area.top + gap) / (h + gap))),
  };
}
