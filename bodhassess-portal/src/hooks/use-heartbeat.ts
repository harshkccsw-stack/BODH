import { useEffect } from 'react';
import { assessmentsApi } from '@/lib/api';

// Keep the admin Live Tracking view informed of where this respondent is.
// Best-effort: failures are swallowed so a flaky network never blocks the
// assessment. Pings immediately, then every 5s while `active`.
export function useHeartbeat(
  sessionId: string | undefined,
  currentIndex: number,
  totalQuestions: number,
  active: boolean,
) {
  useEffect(() => {
    if (!active || !sessionId) return;
    const ping = () => {
      assessmentsApi.heartbeat(sessionId, { currentIndex, totalQuestions }).catch(() => {
        /* swallow */
      });
    };
    ping();
    const t = setInterval(ping, 5000);
    return () => clearInterval(t);
  }, [sessionId, currentIndex, totalQuestions, active]);
}
