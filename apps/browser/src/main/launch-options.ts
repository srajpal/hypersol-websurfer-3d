import { DEFAULT_TILT_DEG, clampTilt } from '@hypersol/scene-core';
import { isAllowedPageUrl } from './security';

export interface LaunchOptions {
  /** First page to show. */
  startUrl: string;
  /** Page tilt in degrees, 0 to 20. */
  tiltDeg: number;
  /** Profile folder for this run, if given on the command line. */
  userDataDir?: string;
  /** Set by the end-to-end tests: records attach and request logs. */
  testMode: boolean;
}

function switchValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? undefined : hit.slice(prefix.length);
}

/**
 * Reads the launch options:
 *   --start-url=<http(s) address>   first page (default about:blank)
 *   --tilt=<degrees>                page tilt, clamped to 0..20 (default 10)
 *   --hypersol-user-data=<folder>   profile folder for this run
 * and HYPERSOL_TEST=1 for test mode.
 */
export function parseLaunchOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): LaunchOptions {
  const url = switchValue(argv, 'start-url');
  const tilt = switchValue(argv, 'tilt');
  const userDataDir = switchValue(argv, 'hypersol-user-data');
  return {
    startUrl: url !== undefined && isAllowedPageUrl(url) ? url : 'about:blank',
    tiltDeg: tilt === undefined || tilt.trim() === '' ? DEFAULT_TILT_DEG : clampTilt(Number(tilt)),
    ...(userDataDir ? { userDataDir } : {}),
    testMode: env['HYPERSOL_TEST'] === '1',
  };
}
