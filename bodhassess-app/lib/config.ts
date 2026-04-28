// Central place to read environment variables. Every `import.meta.env.*`
// reference in the app should come from here so a single edit changes the
// whole project.
//
// Vite inlines VITE_* variables at build time; anything without the prefix
// is not exposed to the browser.

<<<<<<< HEAD
const read = (key: string, fallback = ''): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
};

export const config = {
  /** Full URL of the Go backend including the `/api/v1` prefix. */
  apiBase: read('VITE_API_URL', 'http://localhost:8080/api/v1'),

  /** Brand name shown in page titles, headers, and toast messages. */
  appName: read('VITE_APP_NAME', 'BodhAssess'),

  /** sessionStorage key used to persist the respondent's auth token. */
  authStorageKey: read('VITE_AUTH_STORAGE_KEY', 'bodhassess.auth.token'),

  /** Optional sub-path mount, e.g. "/bodh". Empty string means served at root. */
  basePath: read('VITE_BASE_PATH', ''),
=======
export const config = {
  /** Full URL of the Go backend including the `/api/v1` prefix. */
  apiBase: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1',

  /** Brand name shown in page titles, headers, and toast messages. */
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'BodhAssess',

  /** sessionStorage key used to persist the respondent's auth token. */
  authStorageKey: process.env.NEXT_PUBLIC_AUTH_STORAGE_KEY || 'bodhassess.auth.token',

  /** Optional sub-path mount, e.g. "/bodh". Empty string means served at root. */
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
>>>>>>> 0d049bbc18f6d4cfde6960c2f511d2a32303c268
} as const;

export type AppConfig = typeof config;
