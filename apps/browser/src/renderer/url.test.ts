import { describe, expect, it } from 'vitest';
import { normalizeAddress } from './url';

describe('normalizeAddress', () => {
  it('keeps full web addresses', () => {
    expect(normalizeAddress('https://example.com/a?b=c')).toBe('https://example.com/a?b=c');
    expect(normalizeAddress('  http://example.com  ')).toBe('http://example.com/');
  });

  it('adds https to bare host names', () => {
    expect(normalizeAddress('wikipedia.org')).toBe('https://wikipedia.org/');
    expect(normalizeAddress('en.wikipedia.org/wiki/Web_browser')).toBe(
      'https://en.wikipedia.org/wiki/Web_browser',
    );
    expect(normalizeAddress('example.com:8443/x')).toBe('https://example.com:8443/x');
  });

  it('uses http for this machine', () => {
    expect(normalizeAddress('localhost:5173')).toBe('http://localhost:5173/');
    expect(normalizeAddress('127.0.0.1:8080/page.html')).toBe('http://127.0.0.1:8080/page.html');
  });

  it('allows the blank page', () => {
    expect(normalizeAddress('about:blank')).toBe('about:blank');
  });

  it('refuses other schemes', () => {
    expect(normalizeAddress('file:///C:/Windows/win.ini')).toBeNull();
    expect(normalizeAddress('javascript:alert(1)')).toBeNull();
    expect(normalizeAddress('chrome://gpu')).toBeNull();
    expect(normalizeAddress('mailto:someone@example.com')).toBeNull();
  });

  it('refuses things that are not addresses (search comes in milestone 2)', () => {
    expect(normalizeAddress('')).toBeNull();
    expect(normalizeAddress('   ')).toBeNull();
    expect(normalizeAddress('hello world')).toBeNull();
    expect(normalizeAddress('hello')).toBeNull();
  });
});
