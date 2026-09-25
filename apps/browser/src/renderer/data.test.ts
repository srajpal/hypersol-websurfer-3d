import { describe, expect, it } from 'vitest';
import { groupByDay } from './data';

describe('groupByDay', () => {
  const now = new Date(2026, 8, 25, 15, 0); // 25 September 2026, 3 pm local
  const at = (d: number, h: number) => new Date(2026, 8, d, h, 0).getTime();

  it('labels today, yesterday, and older days, keeping order', () => {
    const groups = groupByDay(
      [
        { id: 1, visitedAt: at(25, 14) },
        { id: 2, visitedAt: at(25, 0) },
        { id: 3, visitedAt: at(24, 23) },
        { id: 4, visitedAt: at(20, 9) },
      ],
      now,
      'en-GB',
    );
    const older = new Date(2026, 8, 20).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(older).toContain('20 September 2026');
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', older]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[1, 2], [3], [4]]);
  });

  it('handles an empty list', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
