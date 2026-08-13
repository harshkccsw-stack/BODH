import axios from 'axios';

import {
  clearDashboardToken,
  getDashboardToken,
  LOGIN_PATH,
} from '@/lib/practitioner-auth-utils';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

/**
 * The one HTTP client every dashboard api file goes through.
 *
 * Before this, each per-page api file called the bare `axios` object with a
 * hand-built URL and NO Authorization header — so the backend had no way to
 * know who was calling, on any dashboard endpoint. That is the prerequisite
 * for both JWT enforcement and the activity trail: identity has to be on the
 * wire before the server can check it or log it.
 *
 * Deliberately a private instance, not `axios.defaults`: a global interceptor
 * would also attach our bearer to any third-party request the app ever makes.
 *
 * Sign-in itself does NOT use this client — see lib/authApis.ts. It has no
 * token to send, and a failed login must render an error on the form rather
 * than trigger the redirect below.
 */
export const api = axios.create({
  baseURL: API_URL,
});

// ── Request: attach the session ─────────────────────────────────────────────
api.interceptors.request.use((request) => {
  const token = getDashboardToken();
  // Never overwrite a header the caller set deliberately.
  if (token && !request.headers.Authorization) {
    request.headers.Authorization = `Bearer ${token}`;
  }
  return request;
});

// ── Response: a dead session ends the session ───────────────────────────────
//
// Only 401 (who are you?) is treated this way, never 403 (I know you, you may
// not do this) — logging a practitioner out because they touched one page
// they lack a role for would be wrong and confusing.
//
// The redirect is a hard assignment rather than a router navigate: this module
// sits outside React, and a stale session must not leave a half-rendered
// dashboard behind. Guarded against firing while already on the login page,
// so a 401 there cannot loop.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      clearDashboardToken();
      if (!window.location.pathname.startsWith(LOGIN_PATH)) {
        window.location.assign(LOGIN_PATH);
      }
    }
    // Rethrow either way: pages still render their own error text from
    // e?.response?.data?.message.
    return Promise.reject(error);
  },
);
