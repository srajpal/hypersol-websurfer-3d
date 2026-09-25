import { describe, expect, it } from 'vitest';
import { CRASHED_CARD, describeLoadError } from './load-errors';

describe('describeLoadError', () => {
  it('names address-not-found errors', () => {
    const card = describeLoadError(-105, 'ERR_NAME_NOT_RESOLVED');
    expect(card.kind).toBe('not-found');
    expect(card.title).toBe("We couldn't find that site");
    expect(card.canRetry).toBe(true);
  });

  it('names connection errors', () => {
    for (const code of [-102, -106, -118, -101]) {
      expect(describeLoadError(code, 'x').kind).toBe('connection');
    }
  });

  it('refuses to retry certificate errors', () => {
    for (const code of [-200, -202, -299]) {
      const card = describeLoadError(code, 'ERR_CERT_AUTHORITY_INVALID');
      expect(card.kind).toBe('certificate');
      expect(card.canRetry).toBe(false);
      expect(card.message).toContain('ERR_CERT_AUTHORITY_INVALID');
    }
  });

  it('falls back to a generic card with the code', () => {
    const card = describeLoadError(-3001, 'ERR_SOMETHING');
    expect(card.kind).toBe('other');
    expect(card.message).toBe('ERR_SOMETHING (-3001)');
  });

  it('has a crash card', () => {
    expect(CRASHED_CARD.title).toBe('This page went dark');
  });
});
