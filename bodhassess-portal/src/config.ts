// Single place to read environment variables. Vite inlines VITE_* vars at
// build time; anything without the prefix is not exposed to the browser.

const read = (key: string, fallback = ''): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
};

export const config = {
  /** Full URL of the shared Spring backend, including the `/api` prefix. */
  apiBase: read('VITE_API_URL', 'https://api.bodh.biz/api'),

  /** Brand name shown in page titles, headers, and messages. */
  appName: read('VITE_APP_NAME', 'BodhAssess'),

  /** localStorage key used to persist the respondent's auth token. */
  authStorageKey: read('VITE_AUTH_STORAGE_KEY', 'bodhassess.auth.token'),

  /** Optional sub-path mount. Empty string means served at root. */
  basePath: read('VITE_BASE_PATH', ''),

  /**
   * Google Analytics 4 measurement id (see lib/analytics.ts). Production
   * builds carry the portal's own id as the default, because `.env.production`
   * is gitignored and a build from a machine without it must not quietly ship
   * without analytics. Dev (`vite`) has no default, so nothing is sent while
   * developing. `off` switches it off in any build.
   */
  gaMeasurementId: ((id) => (id === 'off' ? '' : id))(
    read('VITE_GA_MEASUREMENT_ID', import.meta.env.PROD ? 'G-N6S47FGZNR' : ''),
  ),

  /** `true` marks every hit as debug traffic, so it shows in GA's DebugView. */
  gaDebug: read('VITE_GA_DEBUG') === 'true',
} as const;

export type AppConfig = typeof config;
