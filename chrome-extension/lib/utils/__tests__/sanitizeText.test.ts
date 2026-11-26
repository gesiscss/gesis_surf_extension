import { describe, expect, it } from 'vitest';
import { sanitizeText } from '../sanitizeText';

describe('sanitizeText', () => {
  it('removes NUL characters', () => {
    expect(sanitizeText('before\u0000after')).toBe('beforeafter');
  });

  it('replaces lone surrogates and preserves valid emoji', () => {
    expect(sanitizeText('high\uD800 low\uDC00 🍪')).toBe('high\uFFFD low\uFFFD 🍪');
  });

  it('does not combine lone surrogates separated by a NUL', () => {
    expect(sanitizeText('\uD800\u0000\uDC00')).toBe('\uFFFD\uFFFD');
  });

  it('preserves ordinary Unicode text', () => {
    const text = 'Café שלום مرحبا 🍪';
    expect(sanitizeText(text)).toBe(text);
  });
});
