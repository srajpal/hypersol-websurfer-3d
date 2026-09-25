/**
 * Plain-language error cards for pages that fail. Codes are Chromium's
 * net error codes as reported by the webview's did-fail-load event.
 */

export type LoadErrorKind = 'not-found' | 'connection' | 'certificate' | 'crashed' | 'other';

export interface LoadErrorCard {
  kind: LoadErrorKind;
  title: string;
  message: string;
  /** Retry is offered except where retrying cannot help safely. */
  canRetry: boolean;
}

const NOT_FOUND = new Set([-105, -137]); // NAME_NOT_RESOLVED, NAME_RESOLUTION_FAILED
const CONNECTION = new Set([
  -7, // TIMED_OUT
  -21, // NETWORK_CHANGED
  -100, // CONNECTION_CLOSED
  -101, // CONNECTION_RESET
  -102, // CONNECTION_REFUSED
  -104, // CONNECTION_FAILED
  -106, // INTERNET_DISCONNECTED
  -109, // ADDRESS_UNREACHABLE
  -118, // CONNECTION_TIMED_OUT
  -324, // EMPTY_RESPONSE
]);

/** Chromium reserves -200 to -299 for certificate errors. */
function isCertificateError(code: number): boolean {
  return code <= -200 && code >= -299;
}

export function describeLoadError(code: number, description: string): LoadErrorCard {
  if (NOT_FOUND.has(code)) {
    return {
      kind: 'not-found',
      title: "We couldn't find that site",
      message: 'Check the address for typing mistakes.',
      canRetry: true,
    };
  }
  if (CONNECTION.has(code)) {
    return {
      kind: 'connection',
      title: "Couldn't connect",
      message: 'The site did not answer. Check your connection, or try again in a moment.',
      canRetry: true,
    };
  }
  if (isCertificateError(code)) {
    return {
      kind: 'certificate',
      title: "This site's certificate isn't valid",
      message: `Someone could be pretending to be this site, so HyperSol WebSurfer 3D won't open it. (${description})`,
      canRetry: false,
    };
  }
  return {
    kind: 'other',
    title: "Couldn't load this page",
    message: `${description || 'Unknown error'} (${code})`,
    canRetry: true,
  };
}

export const CRASHED_CARD: LoadErrorCard = {
  kind: 'crashed',
  title: 'This page went dark',
  message: 'Something went wrong while showing this page.',
  canRetry: true,
};
