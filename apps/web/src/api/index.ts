import { SERVER_URL } from '../lib/serverUrl';
import { createApiClient, type ApiClient } from './client';

export { ApiError, createApiClient, type ApiClient, type ClientErrorCode } from './client';
export { SERVER_URL };

/** App-wide API client. */
export const api: ApiClient = createApiClient(SERVER_URL);
