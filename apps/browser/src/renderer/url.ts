/** DuckDuckGo, the default search engine (ARCHITECTURE.md section 4). */
export const DEFAULT_SEARCH_URL = 'https://duckduckgo.com/?q=%s';

/**
 * Turns typed text into a web address, or null if it is not one.
 * Only http, https, and the blank page are accepted.
 */
export function normalizeAddress(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  if (text === 'about:blank') return text;
  if (/\s/.test(text)) return null;
  if (/^https?:\/\//i.test(text)) return parse(text);
  // Any other scheme (file:, javascript:, chrome:, ...) is refused.
  // "host:port" is not a scheme, so a colon followed by a digit is allowed.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return null;
  const host = text.split(/[/?#]/, 1)[0] ?? '';
  const hostname = host.replace(/:\d+$/, '');
  const local = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
  if (!local && !hostname.includes('.')) return null;
  return parse(`${local ? 'http' : 'https'}://${text}`);
}

function parse(text: string): string | null {
  try {
    const url = new URL(text);
    return url.hostname === '' ? null : url.href;
  } catch {
    return null;
  }
}

export type AddressResult =
  | { kind: 'address'; url: string }
  | { kind: 'search'; url: string; query: string };

/**
 * What the address bar does with typed text: load it if it is a web
 * address, otherwise search for it. Null for empty text.
 * searchUrl contains %s where the encoded query goes.
 */
export function resolveInput(input: string, searchUrl = DEFAULT_SEARCH_URL): AddressResult | null {
  const query = input.trim();
  if (query === '') return null;
  const url = normalizeAddress(query);
  if (url !== null) return { kind: 'address', url };
  return { kind: 'search', url: searchUrl.replace('%s', encodeURIComponent(query)), query };
}
