import { session } from 'electron';
import type { AttachRecord } from './security';

/**
 * Logs the end-to-end tests read through Playwright's main-process
 * evaluate. Installed only when HYPERSOL_TEST=1.
 */
export interface TestLog {
  attaches: AttachRecord[];
  requests: string[];
}

declare global {
  var __hypersolTest: TestLog | undefined;
}

export function installTestHooks(): TestLog {
  const log: TestLog = { attaches: [], requests: [] };
  globalThis.__hypersolTest = log;
  // Every request the default session makes (the shell and web pages share it).
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    log.requests.push(details.url);
    callback({});
  });
  return log;
}
