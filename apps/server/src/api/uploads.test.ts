import { describe, expect, it } from 'vitest';
import { sniffAudioType, sniffImageType } from './uploads.routes.js';

const bytes = (hex: string, ascii = '') =>
  Buffer.concat([Buffer.from(hex, 'hex'), Buffer.from(ascii)]);

describe('sniffAudioType', () => {
  it('recognises each accepted audio format by its magic bytes', () => {
    expect(sniffAudioType(Buffer.from('ID3\x04\x00\x00', 'latin1'))).toBe('mp3');
    expect(sniffAudioType(bytes('fffb9064'))).toBe('mp3'); // MPEG-1 layer III frame
    expect(sniffAudioType(bytes('fff15080'))).toBe('aac'); // ADTS
    expect(sniffAudioType(Buffer.from('OggS\x00\x02', 'latin1'))).toBe('ogg');
    expect(sniffAudioType(Buffer.from('\x00\x00\x00\x20ftypM4A ', 'latin1'))).toBe('m4a');
    expect(sniffAudioType(Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'))).toBe('wav');
  });

  it('rejects anything else, whatever the file is called', () => {
    expect(sniffAudioType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffAudioType(bytes('89504e470d0a1a0a'))).toBeNull(); // PNG
    expect(sniffAudioType(Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'))).toBeNull();
    expect(sniffAudioType(Buffer.alloc(0))).toBeNull();
  });

  it('images and sounds are told apart', () => {
    expect(sniffImageType(Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'))).toBeNull();
    expect(sniffImageType(Buffer.from('ID3\x04\x00\x00', 'latin1'))).toBeNull();
  });
});
