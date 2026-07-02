import { useEffect, useState } from 'react';
import { assessmentsApi } from '@/lib/api';

// Fire a single partial-save the moment the respondent records their first
// non-empty answer. The backend stamps started_at on that write, which feeds
// the overdue buckets on the admin dashboard. `alreadyStarted` seeds the
// fired-flag so a resumed session (answers preloaded) doesn't re-ping on mount.
export function useFirstAnswerPing(
  sessionId: string | undefined,
  answers: Record<string, number | string>,
  submitting: boolean,
  alreadyStarted: boolean,
) {
  const [pinged, setPinged] = useState(alreadyStarted);
  useEffect(() => {
    if (pinged || !sessionId || submitting) return;
    const hasAny = Object.values(answers).some((v) =>
      typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null,
    );
    if (!hasAny) return;
    setPinged(true);
    assessmentsApi.update(sessionId, { answers }).catch(() => {
      /* best-effort */
    });
  }, [answers, sessionId, submitting, pinged]);
}
