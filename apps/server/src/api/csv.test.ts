import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';
import { sniffImageType } from './uploads.routes.js';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(42)).toBe('42');
  });

  it('neutralizes spreadsheet formulas in text cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell(-5)).toBe('-5');
  });

  it('joins rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 1],
        ['b', 2],
      ]),
    ).toBe('a,1\r\nb,2\r\n');
  });
});

describe('sniffImageType', () => {
  it('detects image signatures', () => {
    expect(sniffImageType(Buffer.from('89504e470d0a1a0a0000', 'hex'))).toBe('png');
    expect(sniffImageType(Buffer.from('ffd8ffe000', 'hex'))).toBe('jpg');
    expect(sniffImageType(Buffer.from('GIF89a....'))).toBe('gif');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  });

  it('rejects anything else', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('<html>'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});
