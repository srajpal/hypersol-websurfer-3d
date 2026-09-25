import { describe, expect, it } from 'vitest';
import { TabStore } from './tabs';

const ids = (s: TabStore) => s.tabs.map((t) => t.id);

describe('TabStore', () => {
  it('opens start tabs and web tabs, focusing new tabs in front', () => {
    const s = new TabStore();
    const a = s.open();
    expect(a.state).toBe('start');
    expect(a.title).toBe('New tab');
    expect(s.focusedId).toBe(a.id);
    const b = s.open({ url: 'https://example.com/' });
    expect(b.state).toBe('loading');
    expect(s.focusedId).toBe(b.id);
  });

  it('opens background tabs without taking focus, next to their opener', () => {
    const s = new TabStore();
    const a = s.open({ url: 'https://a.example/' });
    const b = s.open({ url: 'https://b.example/' });
    s.focus(a.id);
    const c = s.open({ url: 'https://c.example/', background: true, afterId: a.id });
    expect(ids(s)).toEqual([a.id, c.id, b.id]);
    expect(s.focusedId).toBe(a.id);
  });

  it('a background open with no tabs still focuses the new tab', () => {
    const s = new TabStore();
    const a = s.open({ url: 'https://a.example/', background: true });
    expect(s.focusedId).toBe(a.id);
  });

  it('closing the focused tab focuses its right neighbour, else its left', () => {
    const s = new TabStore();
    const [a, b, c] = [s.open(), s.open(), s.open()];
    s.focus(b.id);
    s.close(b.id);
    expect(s.focusedId).toBe(c.id);
    s.close(c.id);
    expect(s.focusedId).toBe(a.id);
  });

  it('closing a background tab keeps focus', () => {
    const s = new TabStore();
    const [a, b] = [s.open(), s.open()];
    s.close(a.id);
    expect(s.focusedId).toBe(b.id);
    expect(ids(s)).toEqual([b.id]);
  });

  it('closing the last tab leaves a fresh start tab', () => {
    const s = new TabStore();
    const a = s.open({ url: 'https://a.example/' });
    s.close(a.id);
    expect(s.tabs).toHaveLength(1);
    expect(s.focusedTab!.state).toBe('start');
    expect(s.focusedId).not.toBe(a.id);
  });

  it('cycles forward and back with wrap-around', () => {
    const s = new TabStore();
    const [a, b, c] = [s.open(), s.open(), s.open()];
    expect(s.focusedId).toBe(c.id);
    s.cycle(1);
    expect(s.focusedId).toBe(a.id);
    s.cycle(-1);
    expect(s.focusedId).toBe(c.id);
    s.cycle(-1);
    expect(s.focusedId).toBe(b.id);
  });

  it('notifies listeners only on real changes', () => {
    const s = new TabStore();
    const a = s.open();
    let calls = 0;
    s.subscribe(() => calls++);
    s.update(a.id, { title: 'New tab' });
    expect(calls).toBe(0);
    s.update(a.id, { title: 'Hello' });
    expect(calls).toBe(1);
    s.focus(a.id);
    expect(calls).toBe(1);
    s.update(999, { title: 'x' });
    expect(calls).toBe(1);
  });
});
