/**
 * Turns what was typed into the temporary address field into a web
 * address, or null if it is not one. Search from the address bar comes
 * with the HUD in milestone 2.
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
