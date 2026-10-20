import { describe, expect, it } from 'vitest';
import { handshakeToken, readCookie } from './index.js';

describe('readCookie', () => {
  it('finds a cookie among others and decodes it', () => {
    expect(readCookie('a=1; lbq_session=abc%2Fdef; b=2', 'lbq_session')).toBe('abc/def');
    expect(readCookie('xlbq_session=1', 'lbq_session')).toBeNull();
    expect(readCookie(undefined, 'lbq_session')).toBeNull();
    expect(readCookie('lbq_session=', 'lbq_session')).toBeNull();
  });
});

describe('handshakeToken', () => {
  const socket = (auth: object, cookie?: string) =>
    ({ handshake: { auth, headers: { cookie } } }) as unknown as Parameters<
      typeof handshakeToken
    >[0];

  it('prefers auth.token, then the lbq_session cookie', () => {
    expect(handshakeToken(socket({ token: 't1' }, 'lbq_session=t2'))).toBe('t1');
    expect(handshakeToken(socket({}, 'lbq_session=t2'))).toBe('t2');
    expect(handshakeToken(socket({ token: 42 }))).toBeNull();
  });
});
