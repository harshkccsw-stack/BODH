// Single place to read environment variables. Vite inlines VITE_* vars at
// build time; anything without the prefix is not exposed to the browser.

const read = (key: string, fallback = ''): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
};

export const config = {
  /** Full URL of the shared Spring backend, including the `/api/v1` prefix. */
  apiBase: read('VITE_API_URL', 'http://localhost:4000/api/v1'),

  /** Brand name shown in page titles, headers, and messages. */
  appName: read('VITE_APP_NAME', 'BodhAssess'),

  /** localStorage key used to persist the respondent's auth token. */
  authStorageKey: read('VITE_AUTH_STORAGE_KEY', 'bodhassess.auth.token'),

  /** Optional sub-path mount. Empty string means served at root. */
  basePath: read('VITE_BASE_PATH', ''),
} as const;

export type AppConfig = typeof config;
