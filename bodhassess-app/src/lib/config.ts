// Central place to read environment variables. Every `import.meta.env.*`
// reference in the app should come from here so a single edit changes the
// whole project.
//
// Vite inlines VITE_* variables at build time; anything without the prefix
// is not exposed to the browser.

const read = (key: string, fallback = ''): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
};

export const config = {
  /** Full URL of the Spring Boot backend including the `/api/v1` prefix. */
  apiBase: read('VITE_API_URL', 'http://localhost:4000/api/v1'),

  /** Brand name shown in page titles, headers, and toast messages. */
  appName: read('VITE_APP_NAME', 'BodhAssess'),

  /** localStorage key used to persist the respondent's auth token. */
  authStorageKey: read('VITE_AUTH_STORAGE_KEY', 'bodhassess.auth.token'),

  /** localStorage key used to persist the practitioner dashboard auth token. */
  practitionerAuthStorageKey: read('VITE_PRACTITIONER_AUTH_STORAGE_KEY', 'bodhassess.practitioner.token'),

  /** localStorage key used to persist the admin dashboard auth token. */
  adminAuthStorageKey: read('VITE_ADMIN_AUTH_STORAGE_KEY', 'bodhassess.admin.token'),

  /** Optional sub-path mount, e.g. "/bodh". Empty string means served at root. */
  basePath: read('VITE_BASE_PATH', ''),

  /**
   * Origin of the standalone respondent portal app (bodhassess-portal),
   * e.g. https://portal.bodh.biz in production. Respondent-facing links
   * (copy-link, QR, login redirects) are built against this so they leave
   * the admin app and land in the portal. Defaults to the portal's local
   * dev server (http://localhost:3002) so local stays working unchanged;
   * production sets VITE_PORTAL_URL. No trailing slash.
   */
  portalUrl: read('VITE_PORTAL_URL', 'http://localhost:3002'),
} as const;

export type AppConfig = typeof config;
