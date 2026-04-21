// Central place to read environment variables. Every `process.env.*` reference
// in the app should come from here so a single edit changes the whole project.
//
// All vars exposed to the browser must be prefixed NEXT_PUBLIC_ — Next.js
// inlines those at build time. Server-only vars (without the prefix) are
// read from the server process environment at runtime.

const read = (key: string, fallback = ''): string => {
  const v = process.env[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
};

export const config = {
  /** Full URL of the Go backend including the `/api/v1` prefix. */
  apiBase: read('NEXT_PUBLIC_API_URL', 'http://localhost:8080/api/v1'),

  /** Brand name shown in page titles, headers, and toast messages. */
  appName: read('NEXT_PUBLIC_APP_NAME', 'BodhAssess'),

  /** sessionStorage key used to persist the respondent's auth token. */
  authStorageKey: read('NEXT_PUBLIC_AUTH_STORAGE_KEY', 'bodhassess.auth.token'),

  /** Optional sub-path mount, e.g. "/bodh". Empty string means served at root. */
  basePath: read('NEXT_PUBLIC_BASE_PATH', ''),
} as const;

export type AppConfig = typeof config;
