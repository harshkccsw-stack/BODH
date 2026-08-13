import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces. Same base as every other api file in the app; NOT
// config.apiBase, whose fallback still points at the retired v2 API.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

/**
 * Dashboard sign-in, split out of lib/api.ts.
 *
 * These two calls were the only live endpoints left in that file — the other
 * 128 target the retired v2 API — so they now live here, in the same axios
 * dialect as every per-page api file. Nothing in this module imports
 * lib/api.ts, which is what lets the rest of that file be retired without
 * touching sign-in.
 *
 * Credential is email + date of birth (product decision), same as the portal.
 */

// ── Wire types ──────────────────────────────────────────────────────────────

/** Matches AuthUserResponse on the backend. */
interface ApiAuthUser {
  id: number;
  serialId: string | null;
  email: string;
  superAdmin: boolean;
  dashboardAccess: boolean;
  urlPaths: string[];
}

/** Matches LoginResponse on the backend. */
interface ApiLoginResponse {
  token: string;
  user: ApiAuthUser;
}

// ── App-facing types ────────────────────────────────────────────────────────

/**
 * The signed-in identity as the dashboard consumes it. Deliberately not the
 * wire shape: ids are strings here, and urlPaths becomes url_paths because
 * that is what the guards and the sidebar already read.
 */
export interface AuthUser {
  id: string;
  /** Account code shown on screens, e.g. USR-000012. */
  serialId?: string;
  email: string;
  name?: string;
  isSuperAdmin: boolean;
  /** May this identity use the admin/practitioner dashboard at all. */
  dashboardAccess?: boolean;
  roles?: string[];
  url_paths?: string[];
}

export interface AuthLoginResponse {
  token: string;
  user: AuthUser;
}

/**
 * The session object the dashboard renders and the guards check. Kept
 * structurally identical to the shape it had in lib/api.ts so every consumer
 * of the auth context keeps compiling unchanged.
 */
export interface PractitionerMe {
  id: string;
  /** Account code shown in the ID column, e.g. USR-000012. */
  serialId?: string;
  name: string;
  email: string;
  phone?: string;
  roles: string[];
  verticals: string[];
  status: 'Active' | 'Inactive' | string;
  last_login?: string;
  dob?: string;
  /** The EFFECTIVE paths the backend resolved — used as sent. */
  url_paths: string[];
  /** Bypasses every path check — carried through so guards can say so. */
  isSuperAdmin: boolean;
}

function toAuthUser(u: ApiAuthUser): AuthUser {
  return {
    id: String(u.id),
    serialId: u.serialId ?? undefined,
    email: u.email,
    isSuperAdmin: u.superAdmin,
    dashboardAccess: u.dashboardAccess,
    url_paths: u.urlPaths ?? [],
  };
}

// ── Calls ───────────────────────────────────────────────────────────────────

export const authApi = {
  /** dob is ISO (yyyy-MM-dd) on this endpoint — the profile forms send dd-MM-yyyy. */
  login: async (email: string, dob: string): Promise<AuthLoginResponse> => {
    const res = await axios.post<ApiLoginResponse>(`${API_URL}/auth/login`, { email, dob });
    return { token: res.data.token ?? '', user: toAuthUser(res.data.user) };
  },

  /**
   * Re-reads the identity behind a stored token, so a refresh restores the
   * session. The token is passed explicitly rather than read from storage:
   * the caller (the auth provider) owns which slot it came from.
   */
  me: async (token: string): Promise<AuthUser> => {
    const res = await axios.get<ApiAuthUser>(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return toAuthUser(res.data);
  },

  // No logout endpoint: sessions are stateless JWTs, so logging out is
  // purely client-side (drop the stored token).
};
