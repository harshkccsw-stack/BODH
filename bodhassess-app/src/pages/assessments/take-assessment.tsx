import { useEffect } from 'react';
import { useParams } from '@/src/lib/router-helpers';

// Preview page — previously had a hardcoded PHQ-9 mock that drifted from the
// real questionnaire content. Anything reachable via the practitioner UI
// should exercise the same flow respondents use, so route preview traffic
// through /portal/take which loads the actual questionnaire from the DB.
export default function PreviewTakeAssessment() {
  const params = useParams<{ id: string }>();
  const id = params.id || '';

  useEffect(() => {
    const target = id
      ? `/portal/take?id=${encodeURIComponent(id)}`
      : '/portal/assessments';
    window.location.replace(target);
  }, [id]);

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center text-sm text-muted-foreground">
      Opening assessment…
    </div>
  );
}
