import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it('only allows same-app paths', () => {
    expect(safeNext('/editor/abc')).toBe('/editor/abc');
    expect(safeNext(null)).toBe('/editor');
    expect(safeNext('https://evil.example')).toBe('/editor');
    expect(safeNext('//evil.example')).toBe('/editor');
  });
});
