import type {
  ApiErrorBody,
  ApiErrorCode,
  AuthResponse,
  GameReport,
  GameSummary,
  LoginBody,
  PublicUser,
  QuizDetail,
  QuizInput,
  QuizSummary,
  RegisterBody,
  UploadImageResponse,
} from '@lbq/shared';

/** Error codes of the API, plus `NETWORK` when the server can't be reached. */
export type ClientErrorCode = ApiErrorCode | 'NETWORK';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type FetchFn = typeof fetch;

/**
 * Typed client for the REST API of PLAN.md §6. The host session is the httpOnly
 * `lbq_session` cookie, so every request uses `credentials: 'include'`.
 */
export function createApiClient(baseUrl: string, fetchFn: FetchFn = (...a) => fetch(...a)) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, credentials: 'include' };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { 'content-type': 'application/json' };
    }

    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}/api${path}`, init);
    } catch {
      throw new ApiError(0, 'NETWORK', `Le serveur ne répond pas (${baseUrl}).`);
    }
    if (res.status === 204) return undefined as T;
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data as ApiErrorBody | null)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? 'INTERNAL',
        err?.message ?? `Erreur ${res.status}`,
      );
    }
    return data as T;
  }

  return {
    auth: {
      register: (body: RegisterBody) => request<AuthResponse>('POST', '/auth/register', body),
      login: (body: LoginBody) => request<AuthResponse>('POST', '/auth/login', body),
      logout: () => request<void>('POST', '/auth/logout'),
      me: () => request<PublicUser>('GET', '/auth/me'),
    },
    quizzes: {
      list: () => request<QuizSummary[]>('GET', '/quizzes'),
      get: (id: string) => request<QuizDetail>('GET', `/quizzes/${encodeURIComponent(id)}`),
      create: (body: QuizInput) => request<QuizDetail>('POST', '/quizzes', body),
      update: (id: string, body: QuizInput) =>
        request<QuizDetail>('PUT', `/quizzes/${encodeURIComponent(id)}`, body),
      remove: (id: string) => request<void>('DELETE', `/quizzes/${encodeURIComponent(id)}`),
      duplicate: (id: string) =>
        request<QuizDetail>('POST', `/quizzes/${encodeURIComponent(id)}/duplicate`),
    },
    uploads: {
      image: (file: Blob) => {
        const form = new FormData();
        form.append('file', file);
        return request<UploadImageResponse>('POST', '/uploads/image', form);
      },
    },
    games: {
      list: () => request<GameSummary[]>('GET', '/games'),
      get: (id: string) => request<GameReport>('GET', `/games/${encodeURIComponent(id)}`),
      /** For a plain link/download (the session cookie is sent by the browser). */
      exportCsvUrl: (id: string) => `${baseUrl}/api/games/${encodeURIComponent(id)}/export.csv`,
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
