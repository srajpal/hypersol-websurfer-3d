import { DEFAULT_TILT_DEG, clampTilt } from '@hypersol/scene-core';
import { isAllowedPageUrl } from './security';

export interface LaunchOptions {
  /** First page to show; '' opens a start tab. */
  startUrl: string;
  /** Page tilt in degrees, 0 to 20. */
  tiltDeg: number;
  /** Profile folder for this run, if given on the command line. */
  userDataDir?: string;
  /** Set by the end-to-end tests: records logs and exposes test hooks. */
  testMode: boolean;
  /** Test mode only: search address with %s, in place of DuckDuckGo. */
  searchUrl?: string;
  /**
   * Test mode only (HYPERSOL_TEST_BACKGROUND=1): the window opens off
   * screen, without taking focus or a taskbar button, so test runs do
   * not get in the way of whoever is using the computer.
   */
  testBackground: boolean;
  /**
   * Test mode only (HYPERSOL_TEST_KEEP_RUNNING=1): keep running when the
   * last window closes, as the app does on macOS, to test quitting on any
   * platform.
   */
  testKeepRunning: boolean;
}

function switchValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? undefined : hit.slice(prefix.length);
}

/**
 * Reads the launch options:
 *   --start-url=<http(s) address>   first page (default: a start tab)
 *   --tilt=<degrees>                page tilt, clamped to 0..20 (default 10)
 *   --hypersol-user-data=<folder>   profile folder for this run
 *   --search-url=<address with %s>  search engine, test mode only
 * and HYPERSOL_TEST=1 for test mode, HYPERSOL_TEST_BACKGROUND=1 for
 * test windows that stay out of the way.
 */
export function parseLaunchOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): LaunchOptions {
  const url = switchValue(argv, 'start-url');
  const tilt = switchValue(argv, 'tilt');
  const userDataDir = switchValue(argv, 'hypersol-user-data');
  const testMode = env['HYPERSOL_TEST'] === '1';
  const search = switchValue(argv, 'search-url');
  const searchUrl =
    testMode && search !== undefined && search.includes('%s') && isAllowedPageUrl(search) && search !== ''
      ? search
      : undefined;
  return {
    startUrl: url !== undefined && url !== '' && url !== 'about:blank' && isAllowedPageUrl(url) ? url : '',
    tiltDeg: tilt === undefined || tilt.trim() === '' ? DEFAULT_TILT_DEG : clampTilt(Number(tilt)),
    ...(userDataDir ? { userDataDir } : {}),
    testMode,
    ...(searchUrl ? { searchUrl } : {}),
    testBackground: testMode && env['HYPERSOL_TEST_BACKGROUND'] === '1',
    testKeepRunning: testMode && env['HYPERSOL_TEST_KEEP_RUNNING'] === '1',
  };
}
