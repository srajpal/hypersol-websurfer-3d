import { describe, expect, it } from 'vitest';
import { parseDownloadRequest, uniqueName } from '../shared/downloads';
import { applySettingsPatch, DEFAULT_SETTINGS } from '../shared/settings';
import { MAX_ZOOM, MIN_ZOOM, stepZoom, zoomLabel } from './zoom';

describe('zoom steps', () => {
  it('steps through the usual levels and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.17, 1)).toBe(1.25); // between steps: the next one that way
    expect(stepZoom(1.17, -1)).toBe(1.1);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(zoomLabel(1.25)).toBe('125%');
  });

  it('keeps zoom per site in settings, within 25% to 500%', () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { zoomSites: { 'News.Example': 1.5 } })).toEqual({
      settings: { ...DEFAULT_SETTINGS, zoomSites: { 'news.example': 1.5 } },
    });
    expect(applySettingsPatch(DEFAULT_SETTINGS, { zoomSites: { 'a.example': 9 } })).toHaveProperty('error');
    expect(applySettingsPatch(DEFAULT_SETTINGS, { zoomSites: { 'a b': 1.1 } })).toHaveProperty('error');
  });
});

describe('downloads', () => {
  it('never overwrites: a taken name gets a number', () => {
    const taken = new Set(['report.pdf', 'report (1).pdf', 'notes']);
    expect(uniqueName('report.pdf', (n) => taken.has(n))).toBe('report (2).pdf');
    expect(uniqueName('notes', (n) => taken.has(n))).toBe('notes (1)');
    expect(uniqueName('fresh.txt', (n) => taken.has(n))).toBe('fresh.txt');
  });

  it('makes a safe file name', () => {
    // No folder separators, no reserved characters, and no leading dot.
    expect(uniqueName(String.raw`..\..\evil:name?.txt`, () => false)).toBe('__.._evil_name_.txt');
    expect(uniqueName('../x', () => false)).toBe('__x');
    expect(uniqueName('.hidden', () => false)).toBe('_hidden');
    expect(uniqueName('', () => false)).toBe('download');
  });

  it('checks requests from the shell', () => {
    expect(parseDownloadRequest({ op: 'downloads.open', id: 3 })).toEqual({ request: { op: 'downloads.open', id: 3 } });
    expect(parseDownloadRequest({ op: 'downloads.cancel', id: 0 })).toHaveProperty('error');
    expect(parseDownloadRequest({ op: 'downloads.delete-file', id: 1 })).toHaveProperty('error');
  });
});
