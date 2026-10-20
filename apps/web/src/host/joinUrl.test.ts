import { describe, expect, it } from 'vitest';
import { joinOrigins, joinUrl } from './joinUrl';

const loc = (url: string) => {
  const u = new URL(url);
  return { protocol: u.protocol, hostname: u.hostname, port: u.port, origin: u.origin };
};

describe('joinOrigins', () => {
  it('swaps localhost for the LAN addresses, keeping protocol and port', () => {
    expect(
      joinOrigins(loc('http://localhost:5173/host/new'), ['192.168.1.20', '10.0.0.5']),
    ).toEqual(['http://192.168.1.20:5173', 'http://10.0.0.5:5173']);
    expect(joinOrigins(loc('http://127.0.0.1:5188/'), ['192.168.1.20'])).toEqual([
      'http://192.168.1.20:5188',
    ]);
  });

  it('keeps a page already opened on a LAN address or a domain', () => {
    expect(joinOrigins(loc('http://192.168.1.20:5173/host/1'), ['10.0.0.5'])).toEqual([
      'http://192.168.1.20:5173',
    ]);
    expect(joinOrigins(loc('https://lebonquizz.example/host/1'), ['10.0.0.5'])).toEqual([
      'https://lebonquizz.example',
    ]);
  });

  it('falls back to the page origin when no LAN address is known', () => {
    expect(joinOrigins(loc('http://localhost:5173/'), [])).toEqual(['http://localhost:5173']);
  });

  it('handles the default port', () => {
    expect(joinOrigins(loc('https://localhost/'), ['192.168.1.20'])).toEqual([
      'https://192.168.1.20',
    ]);
  });
});

describe('joinUrl', () => {
  it('pre-fills the PIN', () => {
    expect(joinUrl('http://192.168.1.20:5173', '012345')).toBe(
      'http://192.168.1.20:5173/join?pin=012345',
    );
  });
});
