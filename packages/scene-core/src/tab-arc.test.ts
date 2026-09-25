import { describe, expect, it } from 'vitest';
import { clampScroll, computeTabArc, maxScroll, scrollToShow, type TabArcInput } from './tab-arc.js';

const base: TabArcInput = {
  viewportWidth: 1280,
  viewportHeight: 800,
  rail: { left: 28, top: 80, width: 200, bottom: 772 },
  cardWidth: 200,
  cardHeight: 140,
  gap: 16,
  count: 3,
  scroll: 0,
};

describe('computeTabArc', () => {
  it('stacks cards down the rail at full size, first at the top', () => {
    const { cards } = computeTabArc(base);
    expect(cards).toHaveLength(3);
    // First card's centre is 70 px below the rail top: world y = 400 - 150.
    expect(cards[0]!.position.y).toBeCloseTo(250, 9);
    expect(cards[0]!.position.y - cards[1]!.position.y).toBeCloseTo(156, 9);
    // Rail centre x: 28 + 100 - 640.
    for (const c of cards) expect(c.position.x).toBeCloseTo(-512, 9);
    for (const c of cards) expect(c.opacity).toBe(1);
  });

  it('bows the middle of the rail toward the viewer and leans the ends', () => {
    const { cards } = computeTabArc({ ...base, count: 5 });
    const middle = cards[2]!;
    const top = cards[0]!;
    expect(middle.position.z).toBeGreaterThan(top.position.z);
    expect(top.rotationX).toBeLessThan(0);
    expect(cards[4]!.rotationX).toBeGreaterThan(0);
    for (const c of cards) expect(c.rotationY).toBeGreaterThan(0); // turned toward the room
  });

  it('reports how many cards fit and how far the rail can scroll', () => {
    const many = { ...base, count: 12 };
    const layout = computeTabArc(many);
    expect(layout.fits).toBe(4); // (692 + 16) / 156
    expect(layout.maxScroll).toBe(maxScroll(many));
    expect(layout.maxScroll).toBe(12 * 140 + 11 * 16 - 692);
    expect(computeTabArc({ ...base, count: 2 }).maxScroll).toBe(0);
  });

  it('keeps card size when scrolled and hides cards outside the rail', () => {
    const many = { ...base, count: 12 };
    const scrolled = computeTabArc({ ...many, scroll: 156 * 3 });
    expect(scrolled.cards[3]!.position.y).toBeCloseTo(250, 9); // card 3 now at the top
    expect(scrolled.cards[0]!.visible).toBe(false);
    expect(scrolled.cards[3]!.opacity).toBe(1);
    expect(scrolled.cards[11]!.visible).toBe(false);
  });

  it('fades a card that is half outside the rail', () => {
    const { cards } = computeTabArc({ ...base, count: 12, scroll: 35 });
    expect(cards[0]!.opacity).toBeCloseTo(0.5, 9);
    expect(cards[0]!.visible).toBe(true);
  });
});

describe('scrolling', () => {
  const many = { ...base, count: 12 };

  it('clamps scroll to the rail', () => {
    expect(clampScroll(many, -50)).toBe(0);
    expect(clampScroll(many, 1e6)).toBe(maxScroll(many));
    expect(clampScroll(many, Number.NaN)).toBe(0);
  });

  it('scrolls just enough to show a card', () => {
    expect(scrollToShow(many, 0)).toBe(0);
    const s = scrollToShow(many, 11);
    expect(s).toBe(maxScroll(many));
    const mid = scrollToShow({ ...many, scroll: 0 }, 5);
    // Card 5 spans 780..920; rail height 692 -> scroll 228.
    expect(mid).toBe(5 * 156 + 140 - 692);
    // Already visible: no change.
    expect(scrollToShow({ ...many, scroll: mid }, 3)).toBe(mid);
  });
});

describe('pinned "+" card', () => {
  const pinned = { ...base, pinLast: true };

  it('follows the last tab while the tabs fit', () => {
    const { cards, maxScroll: max } = computeTabArc({ ...pinned, count: 3 });
    expect(max).toBe(0);
    expect(cards[1]!.position.y - cards[2]!.position.y).toBeCloseTo(156, 9);
  });

  it('stays at the bottom of the rail, in view, whatever the scroll', () => {
    const many = { ...pinned, count: 13 }; // 12 tabs and the "+" card
    for (const scroll of [0, 300, 1e6]) {
      const { cards } = computeTabArc({ ...many, scroll });
      const plus = cards[12]!;
      expect(plus.opacity).toBe(1);
      // Its centre is half a card above the rail bottom: world y = 400 - 702.
      expect(plus.position.y).toBeCloseTo(-302, 9);
    }
  });

  it('scrolls the tabs in the space above it', () => {
    const many = { ...pinned, count: 13 };
    // Tab area: 80..616 (the last slot of 156 is kept for "+").
    expect(maxScroll(many)).toBe(12 * 140 + 11 * 16 - (616 - 80));
    const end = computeTabArc({ ...many, scroll: 1e6 });
    // The last tab ends just above the "+" card's slot.
    expect(400 - end.cards[11]!.position.y + 70).toBeCloseTo(616, 9);
    expect(end.cards[11]!.opacity).toBe(1);
    expect(end.fits).toBe(3);
  });

  it('scrollToShow brings a tab above the "+" card', () => {
    const many = { ...pinned, count: 13 };
    expect(scrollToShow(many, 11)).toBe(maxScroll(many));
    expect(scrollToShow(many, 12)).toBe(0); // the pinned card needs no scroll
  });
});
