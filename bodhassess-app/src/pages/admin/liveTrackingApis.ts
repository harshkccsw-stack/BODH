import { api } from '@/lib/apiClient';
import type { ReportPage } from '../Reports/reportApis';

// ── Wire shapes — mirror spring-social's LiveTrackingResponse 1:1 ──────────

/**
 * Matches LiveTrackingResponse.State on the backend. Declaration order is the
 * server's sort priority — most alive first.
 *
 * LIVE          heartbeat within ~25s — actively answering
 * NO_SIGNAL     pings stopped 25–60s ago (hidden tab / network blip)
 * DISCONNECTED  silent for over a minute; last position still remembered
 * OFFLINE       in progress in the database but no heartbeat memory at all
 * PROCESSING    submitted — answers staged in Redis, digest still writing
 * COMPLETED     answers durably in the database
 * NOT_STARTED   allotted, never begun (or abandoned back to the start)
 */
export type LiveTrackingState =
  | 'LIVE'
  | 'NO_SIGNAL'
  | 'DISCONNECTED'
  | 'OFFLINE'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'NOT_STARTED';

/** Matches LiveTrackingResponse.Row on the backend. */
export interface LiveTrackingRow {
  respondentAssessmentMappingId: number;
  respondentName: string;
  respondentEmail: string;
  serialId: string;
  organizationId: number | null;
  organizationName: string | null;
  assessmentId: number;
  assessmentName: string;
  state: LiveTrackingState;
  /** 1-based; null when there is no heartbeat to know it from. */
  currentQuestion: number | null;
  /** PROCESSING/COMPLETED arrive with this equal to totalQuestions. */
  answeredCount: number | null;
  totalQuestions: number;
  /** Epoch millis of the last heartbeat; null when there is none. */
  lastSeenMillis: number | null;
}

/** Matches LiveTrackingResponse.Summary — whole-filter totals for the cards. */
export interface LiveTrackingSummary {
  live: number;
  noSignal: number;
  disconnected: number;
  offline: number;
  processing: number;
  completed: number;
  notStarted: number;
  total: number;
}

/** Matches LiveTrackingResponse on the backend. */
export interface LiveTrackingResult {
  summary: LiveTrackingSummary;
  page: ReportPage<LiveTrackingRow>;
}

export interface LiveTrackingQuery {
  organizationId?: number;
  assessmentId?: number;
  page?: number;
  size?: number;
}

// axios drops undefined params — omitted filters mean all organizations /
// any assessment, which is a valid (and the broadest) view of this page.
function getLiveTracking(query: LiveTrackingQuery) {
  return api.get<LiveTrackingResult>(`/reports/liveTracking`, { params: query });
}

export const liveTrackingApis = { getLiveTracking };
