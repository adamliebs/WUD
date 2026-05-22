/**
 * HTTP client for the WUD backend.
 *
 * - Prefixes every request with the API base URL.
 * - Attaches the bearer access token.
 * - On a 401, transparently refreshes the token once and retries.
 * - Surfaces the server's `{ error: { code, message } }` shape as an ApiError.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const ACCESS_KEY = 'wud_access';
const REFRESH_KEY = 'wud_refresh';

/* ----- token storage (localStorage so a reload keeps you signed in) ------- */

export const tokens = {
  get access() { return localStorage.getItem(ACCESS_KEY); },
  get refresh() { return localStorage.getItem(REFRESH_KEY); },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  get hasSession() { return !!localStorage.getItem(ACCESS_KEY); },
};

/* ----- error type --------------------------------------------------------- */

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ----- core fetch --------------------------------------------------------- */

interface ReqOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header (auth endpoints). */
  noAuth?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Attempt a token refresh. Returns true on success. De-duped across callers. */
async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/auth/token/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refresh }),
        });
        if (!res.ok) return false;
        const data = await res.json() as { accessToken: string; refreshToken: string };
        tokens.set(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function rawRequest<T>(path: string, opts: ReqOptions, retrying = false): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!opts.noAuth && tokens.access) {
    headers.authorization = `Bearer ${tokens.access}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is the backend running?');
  }

  // 401 → refresh once, then retry.
  if (res.status === 401 && !opts.noAuth && !retrying) {
    const ok = await tryRefresh();
    if (ok) return rawRequest<T>(path, opts, true);
    tokens.clear();
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session expired. Please sign in again.');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Request failed');
  }
  return data as T;
}

/* ----- verb helpers ------------------------------------------------------- */

export const api = {
  get:   <T>(path: string) => rawRequest<T>(path, { method: 'GET' }),
  post:  <T>(path: string, body?: unknown, noAuth = false) =>
            rawRequest<T>(path, { method: 'POST', body, noAuth }),
  put:   <T>(path: string, body?: unknown) => rawRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => rawRequest<T>(path, { method: 'PATCH', body }),
  del:   <T>(path: string) => rawRequest<T>(path, { method: 'DELETE' }),
};

export const apiBaseUrl = API_BASE;
