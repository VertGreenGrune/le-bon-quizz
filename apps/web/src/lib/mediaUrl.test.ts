import { describe, expect, it } from 'vitest';
import { mediaUrl } from './mediaUrl';

describe('mediaUrl', () => {
  const phone = 'http://192.168.1.158:3001';

  it('rebuilds an uploaded file on the server the page talks to', () => {
    expect(mediaUrl('http://localhost:3001/uploads/carte.jpg', phone)).toBe(
      'http://192.168.1.158:3001/uploads/carte.jpg',
    );
    expect(mediaUrl('/uploads/son.mp3', 'https://lebonquizz.fly.dev/')).toBe(
      'https://lebonquizz.fly.dev/uploads/son.mp3',
    );
  });

  it('leaves other URLs and empty values alone', () => {
    expect(mediaUrl('https://upload.wikimedia.org/x.jpg', phone)).toBe(
      'https://upload.wikimedia.org/x.jpg',
    );
    expect(mediaUrl('/avatars/batman.jpg', phone)).toBe('/avatars/batman.jpg');
    expect(mediaUrl(undefined, phone)).toBeUndefined();
    expect(mediaUrl('', phone)).toBe('');
  });
});
