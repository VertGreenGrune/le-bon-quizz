import type {
  ApiErrorBody,
  ApiErrorCode,
  AuthResponse,
  ChangePasswordBody,
  ForgotPasswordBody,
  GameReport,
  GameSummary,
  LibraryQuery,
  LibraryQuiz,
  LoginBody,
  PublicUser,
  QuizDetail,
  QuizInput,
  QuizSummary,
  RegisterBody,
  ResetPasswordBody,
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
      /** Always resolves (neutral answer), unless the server can't be reached. */
      forgotPassword: (body: ForgotPasswordBody) =>
        request<void>('POST', '/auth/forgot-password', body),
      resetPassword: (body: ResetPasswordBody) =>
        request<AuthResponse>('POST', '/auth/reset-password', body),
      changePassword: (body: ChangePasswordBody) =>
        request<void>('POST', '/auth/change-password', body),
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
    library: {
      list: ({ search, sort }: LibraryQuery = {}) => {
        const query = new URLSearchParams();
        if (search?.trim()) query.set('search', search.trim());
        if (sort) query.set('sort', sort);
        const qs = query.toString();
        return request<LibraryQuiz[]>('GET', `/library${qs ? `?${qs}` : ''}`);
      },
      /** "Copier dans mes quiz": a private copy owned by the current host. */
      copy: (id: string) => request<QuizDetail>('POST', `/library/${encodeURIComponent(id)}/copy`),
    },
    uploads: {
      image: (file: Blob) => {
        const form = new FormData();
        form.append('file', file);
        return request<UploadImageResponse>('POST', '/uploads/image', form);
      },
      audio: (file: Blob) => {
        const form = new FormData();
        form.append('file', file);
        return request<UploadImageResponse>('POST', '/uploads/audio', form);
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
