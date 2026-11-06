import { describe, expect, it, vi } from 'vitest';
import { LoginBody, RegisterBody } from '@lbq/shared';
import { ApiError, createApiClient } from './client';
import { validate } from './validation';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createApiClient', () => {
  it('sends JSON with credentials to /api', async () => {
    const fetchFn = vi.fn(async () => json(200, { user: { id: 'u' }, token: 't' }));
    const api = createApiClient('http://srv:3001', fetchFn);
    await api.auth.login({ email: 'a@b.c', password: 'x' });
    expect(fetchFn).toHaveBeenCalledWith('http://srv:3001/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: 'a@b.c', password: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
  });

  it('turns error bodies into ApiError', async () => {
    const api = createApiClient('', async () =>
      json(404, { error: { code: 'NOT_FOUND', message: 'Quiz introuvable' } }),
    );
    const err = await api.quizzes.get('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Quiz introuvable' });
  });

  it('maps network failures to NETWORK and 204 to undefined', async () => {
    const down = createApiClient('', async () => {
      throw new TypeError('fetch failed');
    });
    await expect(down.quizzes.list()).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
    const ok = createApiClient('', async () => new Response(null, { status: 204 }));
    await expect(ok.quizzes.remove('x')).resolves.toBeUndefined();
  });

  it('T46: reads the auth config and exchanges a Firebase ID token', async () => {
    const fetchFn = vi.fn(async () => json(200, {}));
    const api = createApiClient('', fetchFn);
    await api.auth.config();
    await api.auth.firebase({ idToken: 'tok', name: 'Léa' });
    expect(fetchFn).toHaveBeenNthCalledWith(1, '/api/auth/config', {
      method: 'GET',
      credentials: 'include',
    });
    expect(fetchFn).toHaveBeenNthCalledWith(2, '/api/auth/firebase', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ idToken: 'tok', name: 'Léa' }),
      headers: { 'content-type': 'application/json' },
    });
  });

  it('builds the library query string', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL) => json(200, []));
    const api = createApiClient('', fetchFn);
    await api.library.list();
    await api.library.list({ search: ' bastille & co ', sort: 'newest' });
    await api.library.copy('q 1');
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      '/api/library',
      '/api/library?search=bastille+%26+co&sort=newest',
      '/api/library/q%201/copy',
    ]);
  });

  it('calls the password endpoints', async () => {
    const fetchFn = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const api = createApiClient('', fetchFn);
    await api.auth.forgotPassword({ email: 'a@b.fr' });
    await api.auth.changePassword({ currentPassword: 'old', newPassword: 'nouveau-mdp' });
    expect(fetchFn.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ['/api/auth/forgot-password', 'POST', '{"email":"a@b.fr"}'],
      [
        '/api/auth/change-password',
        'POST',
        '{"currentPassword":"old","newPassword":"nouveau-mdp"}',
      ],
    ]);
    const expired = createApiClient('', async () =>
      json(400, { error: { code: 'RESET_TOKEN_INVALID', message: 'Lien expiré' } }),
    );
    await expect(
      expired.auth.resetPassword({ token: 't', password: 'nouveau-mdp' }),
    ).rejects.toMatchObject({ status: 400, code: 'RESET_TOKEN_INVALID' });
  });

  it('uploads images as multipart without a JSON content-type', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json(201, { url: 'u' }),
    );
    const api = createApiClient('', fetchFn);
    await api.uploads.image(new Blob(['x'], { type: 'image/png' }));
    const init = fetchFn.mock.calls[0]![1]!;
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
  });
});

describe('validate (auth forms)', () => {
  it('normalizes valid input and reports French field errors', () => {
    expect(validate(LoginBody, { email: ' A@B.fr ', password: 'x' })).toEqual({
      ok: true,
      data: { email: 'a@b.fr', password: 'x' },
    });
    expect(validate(RegisterBody, { email: 'nope', name: '', password: 'short' })).toEqual({
      ok: false,
      errors: {
        email: 'Adresse e-mail invalide',
        name: 'Champ obligatoire',
        password: 'Au moins 8 caractères',
      },
    });
  });
});
