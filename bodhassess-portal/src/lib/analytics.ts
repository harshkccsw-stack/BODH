// Google Analytics 4 — the respondent's journey through the portal.
//
// The take flow is ONE route (/portal/assessment/:sessionId) whose gates and
// question pages are internal state, so GA's own page tracking would see a
// single page per attempt. Every screen therefore reports a VIRTUAL page of
// its own through usePageView, and what the respondent does reports through
// track(). GA's automatic page views are off (send_page_view: false). Two
// switches in the GA stream's Enhanced measurement must stay OFF as well,
// because code cannot reach them: "Page changes based on browser history
// events" (would log the raw URLs beside ours) and "Form interactions" (its
// form_submit reports form_destination, which for our action-less forms is
// the REAL page URL — the registration token, the login page's ?email=).
//
// What leaves the browser is deliberately narrow:
//  - URLs are rebuilt, never copied. The registration token and the attempt id
//    are cut out of paths, and every query parameter except utm_* / gclid is
//    dropped — the login page can carry ?email=.
//  - The person is identified by serialId (USR-000123, what the dashboard
//    shows) and nothing else: never name, email, phone or dob — dob is the
//    portal password. Google's terms forbid personal data in GA anyway.
//  - No answers, demographic values or typed text, ever.
//
// No measurement id (dev) → every call is a no-op and gtag.js never loads.

import { useEffect } from 'react';
import { config } from '@/config';

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const KEPT_QUERY = /^(utm_[a-z_]+|gclid)$/i;

let started = false;
let identified = false;
// Merged into every event while the respondent is inside one assessment.
let context: AnalyticsParams = {};
let lastPath: string | null = null;
let lastLocation: string | null = null;

// The official snippet's shape. gtag.js only reads Arguments objects off the
// queue — pushing an array is silently ignored.
function gtag(..._args: unknown[]): void {
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
}

/** Origin + path + the campaign parameters, nothing else from the real URL. */
function locationFor(path: string): string {
  const kept = new URLSearchParams();
  new URLSearchParams(window.location.search).forEach((value, key) => {
    if (KEPT_QUERY.test(key)) kept.append(key, value);
  });
  const qs = kept.toString();
  return `${window.location.origin}${path}${qs ? `?${qs}` : ''}`;
}

/**
 * The real path with its secrets cut out — only for the moment between gtag
 * loading and the first screen reporting its own virtual page.
 */
function scrubbedPath(pathname: string): string {
  return pathname
    .replace(/^(\/portal)?\/register\/[^/]+/, '$1/register/:token')
    .replace(/^\/portal\/assessment\/[^/]+/, '/portal/assessment/:id');
}

/** Load gtag.js. Called once, before the first render. */
export function initAnalytics(): void {
  const id = config.gaMeasurementId;
  if (!id || started) return;
  started = true;

  // Same-origin referrers are full URLs and may hold a token; another site's
  // referrer arrives as its bare origin under the default referrer policy.
  let referrer = document.referrer;
  try {
    const ref = new URL(referrer);
    if (ref.origin === window.location.origin) referrer = `${ref.origin}${scrubbedPath(ref.pathname)}`;
  } catch {
    referrer = '';
  }

  gtag('js', new Date());
  // Before config, so not one hit ever carries the real landing URL.
  gtag('set', {
    page_location: locationFor(scrubbedPath(window.location.pathname)),
    page_referrer: referrer || undefined,
  });
  gtag('config', id, {
    send_page_view: false,
    // No advertising features: these are respondents sitting an assessment,
    // not an audience.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // GA treats ANY debug_mode value, false included, as on.
    ...(config.gaDebug ? { debug_mode: true } : {}),
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/**
 * The signed-in respondent, or null once signed out. A null with nobody
 * identified is dropped: clearing sends empty values, and an anonymous
 * visitor's hits should carry none at all.
 */
export function identify(
  user: { serialId: string; organizationId: number | null; organizationName: string | null } | null,
): void {
  if (!started || (user === null && !identified)) return;
  identified = user !== null;
  gtag('set', { user_id: user?.serialId ?? null });
  gtag('set', 'user_properties', {
    organization_id: user?.organizationId != null ? String(user.organizationId) : null,
    organization_name: user?.organizationName ?? null,
  });
}

/**
 * The assessment the respondent is inside — its id and name ride every event
 * and page view until cleared. Set where the attempt loads, BEFORE the screens
 * mount: a child's effects run before its parent's, so a parent effect would
 * be too late for the first question page.
 */
export function setTakeContext(next: AnalyticsParams | null): void {
  context = next ?? {};
}

export function track(event: string, params: AnalyticsParams = {}): void {
  if (!started) return;
  gtag('event', event, { ...context, ...params });
}

/**
 * Report a screen. `path` is the virtual path GA files it under, already free
 * of anything private. A repeat of the path just reported is dropped, which
 * also absorbs StrictMode's double effects in dev.
 */
export function trackPageView(path: string, title: string, params: AnalyticsParams = {}): void {
  if (!started || path === lastPath) return;
  const location = locationFor(path);
  // page_location and page_title persist on every later event, so a click is
  // filed under the screen it happened on.
  gtag('set', {
    page_location: location,
    page_title: title,
    ...(lastLocation ? { page_referrer: lastLocation } : {}),
  });
  gtag('event', 'page_view', { ...context, ...params, page_location: location, page_title: title });
  lastPath = path;
  lastLocation = location;
}

/**
 * Report a screen whenever `path` changes; null = nothing to report yet.
 * `title` and `params` are read at that moment, never watched.
 */
export function usePageView(path: string | null, title: string, params?: AnalyticsParams): void {
  useEffect(() => {
    if (path !== null) trackPageView(path, title, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
}

/** An HTTP status for failure events, or 'network' when the call never landed. */
export function failureStatus(e: unknown): string {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? String(status) : 'network';
}
