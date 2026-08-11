import { api } from '@/lib/apiClient';

export type ActivityOutcome = 'SUCCESS' | 'CLIENT_ERROR' | 'SERVER_ERROR';

/** Matches ReportPageResponse<T> on the backend — the shared page envelope. */
export interface ActivityPage<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Matches ActivityLogResponse on the backend. One answered HTTP request.
 *
 * actorUserId/actorEmail are null for anonymous calls — normal until
 * app.security.require-auth is switched on. actorEmail is a snapshot taken at
 * the time, not a lookup of who that id belongs to now.
 *
 * pathTemplate is the matched mapping ("/api/questions/delete/{id}"), so rows
 * group by endpoint rather than by id; null when nothing matched (a 404).
 */
export interface ActivityRow {
  activityLogId: number;
  requestId: string | null;
  occurredAt: string;
  actorUserId: number | null;
  actorEmail: string | null;
  actorSuperAdmin: boolean;
  method: string;
  path: string;
  pathTemplate: string | null;
  queryString: string | null;
  httpStatus: number;
  outcome: ActivityOutcome;
  errorMessage: string | null;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
}

export interface ActivityQuery {
  actorUserId?: number;
  outcome?: ActivityOutcome;
  method?: string;
  /** ISO date-time; the backend parses both as ISO_DATE_TIME. */
  from?: string;
  to?: string;
  /** Matches path or actor email, contains, case-insensitive. */
  search?: string;
  page?: number;
  size?: number;
}

/**
 * Super-admin only — the backend enforces that itself and answers 403 for
 * anyone else, regardless of the global require-auth flag.
 */
function getAll(query: ActivityQuery) {
  return api.get<ActivityPage<ActivityRow>>(`/activity/getAll`, { params: query });
}

export const activityApis = {
  getAll,
};
