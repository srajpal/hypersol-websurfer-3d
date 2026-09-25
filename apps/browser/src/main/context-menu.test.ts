import { describe, expect, it } from 'vitest';
import { contextMenuEntries, type MenuEntry, type MenuParams } from './context-menu';

const none = { canCut: false, canCopy: false, canPaste: false, canSelectAll: false };
const params = (p: Partial<MenuParams>): MenuParams => ({
  linkURL: '',
  selectionText: '',
  isEditable: false,
  editFlags: none,
  ...p,
});
const nav = { canGoBack: true, canGoForward: false };
const labels = (entries: MenuEntry[]) => entries.map((e) => ('separator' in e ? '---' : e.label));

describe('contextMenuEntries', () => {
  it('offers back, forward, and reload on the page itself', () => {
    const entries = contextMenuEntries(params({}), nav);
    expect(labels(entries)).toEqual(['Back', 'Forward', 'Reload']);
    expect(entries.map((e) => ('enabled' in e ? e.enabled : null))).toEqual([true, false, true]);
  });

  it('offers link actions on a link', () => {
    expect(labels(contextMenuEntries(params({ linkURL: 'https://example.com/' }), nav))).toEqual([
      'Open link in new tab',
      'Copy link address',
    ]);
  });

  it('ignores non-web links', () => {
    expect(labels(contextMenuEntries(params({ linkURL: 'javascript:void(0)' }), nav))).toEqual([
      'Back',
      'Forward',
      'Reload',
    ]);
  });

  it('offers copy for selected text, with link actions when both apply', () => {
    expect(labels(contextMenuEntries(params({ selectionText: 'hello' }), nav))).toEqual(['Copy']);
    expect(
      labels(contextMenuEntries(params({ selectionText: 'hello', linkURL: 'http://a.example/' }), nav)),
    ).toEqual(['Open link in new tab', 'Copy link address', '---', 'Copy']);
  });

  it('offers editing actions in a text field, enabled by what the field allows', () => {
    const entries = contextMenuEntries(
      params({ isEditable: true, editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } }),
      nav,
    );
    expect(labels(entries)).toEqual(['Cut', 'Copy', 'Paste', 'Select all']);
    expect(entries.map((e) => ('enabled' in e ? e.enabled : null))).toEqual([false, false, true, true]);
  });
});
