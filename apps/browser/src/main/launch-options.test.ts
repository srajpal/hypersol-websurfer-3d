import { describe, expect, it } from 'vitest';
import { parseLaunchOptions } from './launch-options';
import { isAllowedPageUrl } from './security';

describe('parseLaunchOptions', () => {
  it('has safe defaults', () => {
    expect(parseLaunchOptions(['electron', '.'], {})).toEqual({
      startUrl: 'about:blank',
      tiltDeg: 10,
      testMode: false,
    });
  });

  it('reads start address, tilt, profile folder, and test mode', () => {
    const opts = parseLaunchOptions(
      ['electron', '.', '--start-url=http://127.0.0.1:4000/a.html', '--tilt=20', '--hypersol-user-data=C:\\tmp\\x'],
      { HYPERSOL_TEST: '1' },
    );
    expect(opts).toEqual({
      startUrl: 'http://127.0.0.1:4000/a.html',
      tiltDeg: 20,
      userDataDir: 'C:\\tmp\\x',
      testMode: true,
    });
  });

  it('clamps tilt and refuses non-web start addresses', () => {
    expect(parseLaunchOptions(['--tilt=90'], {}).tiltDeg).toBe(20);
    expect(parseLaunchOptions(['--tilt=-3'], {}).tiltDeg).toBe(0);
    expect(parseLaunchOptions(['--tilt=abc'], {}).tiltDeg).toBe(10);
    expect(parseLaunchOptions(['--start-url=file:///etc/passwd'], {}).startUrl).toBe('about:blank');
    expect(parseLaunchOptions(['--start-url=javascript:alert(1)'], {}).startUrl).toBe('about:blank');
  });
});

describe('isAllowedPageUrl', () => {
  it('allows only web addresses and the blank page', () => {
    expect(isAllowedPageUrl('https://example.com/')).toBe(true);
    expect(isAllowedPageUrl('http://127.0.0.1:3000/')).toBe(true);
    expect(isAllowedPageUrl('about:blank')).toBe(true);
    expect(isAllowedPageUrl('file:///C:/x.html')).toBe(false);
    expect(isAllowedPageUrl('chrome://settings')).toBe(false);
    expect(isAllowedPageUrl('not a url')).toBe(false);
  });
});
