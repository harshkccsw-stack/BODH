import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenLoader } from '@/components/screen-loader';
import { ErrorCard } from '@/components/error-card';
import { useAuth } from '@/lib/auth';
import {
  demographicFieldsApi,
  portalSessionsApi,
  questionnairesApi,
  type DemographicField,
  type PortalSession,
  type Questionnaire,
} from '@/lib/api';
import { scoreAssessment } from '@/lib/scoring';
import { TermsStep } from './terms-step';
import { DemographicsStep } from './demographics-step';
import { InstructionsStep } from './instructions-step';
import { QuestionRunner } from './question-runner';
import { CompleteStep } from './complete-step';

type GateStep = 'terms' | 'demographics' | 'instructions' | 'questions';

// Orchestrator for /portal/assessment/:sessionId. Loads the session +
// questionnaire, then walks the applicable steps in the requested order:
//   terms → demographics → instructions → questions → done
// Completion is the terminal state (no separate route).
export default function TakePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState<PortalSession | null>(null);
  const [instrument, setInstrument] = useState<Questionnaire | null>(null);
  const [demoCatalog, setDemoCatalog] = useState<DemographicField[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [loadError, setLoadError] = useState('');
  // Applicable steps, frozen at load (see the load effect) so mid-flow state
  // changes can never resync stepIndex to a now-shorter list.
  const [steps, setSteps] = useState<GateStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const backToList = () => navigate('/portal/assessment', { replace: true });

  // Demographic catalogue (active subset).
  useEffect(() => {
    demographicFieldsApi
      .list(true)
      .then(setDemoCatalog)
      .catch(() => setDemoCatalog([]));
  }, []);

  // Load session + resolve questionnaire content.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (!sessionId) {
        setLoadError('No assessment specified.');
        return;
      }
      let s: PortalSession;
      try {
        s = await portalSessionsApi.get(sessionId);
      } catch {
        setLoadError('Assessment not found.');
        return;
      }
      if (s.respondentId !== user.id) {
        setLoadError('This assessment is not assigned to you.');
        return;
      }
      if (s.status === 'Completed') {
        setLoadError('This assessment has already been submitted.');
        return;
      }

      // Prefer the pinned version (immutable) so a later re-publish never
      // changes what this respondent sees; fall back to by-name lookup.
      let inst: Questionnaire | null = null;
      if (s.questionnaireVersionId) {
        try {
          inst = await questionnairesApi.get(s.questionnaireVersionId);
        } catch {
          /* fall through to by-name */
        }
      }
      if (!inst) {
        const target = (s.instrumentFullName || s.instrument || '').trim();
        const shortTarget = (s.instrument || '').trim();
        for (const candidate of [target, shortTarget]) {
          if (!candidate) continue;
          try {
            const res = await questionnairesApi.getByName(candidate);
            if (res) {
              inst = res;
              break;
            }
          } catch {
            /* try next candidate */
          }
        }
      }
      if (!inst) {
        const name = (s.instrumentFullName || s.instrument || '').trim();
        setLoadError(
          `The assessment "${name}" isn't available in the database. Ask your administrator to publish it via Question Bank → Create Questionnaire.`,
        );
        return;
      }

      if (cancelled) return;

      // Freeze the applicable step list from the load-time snapshot. Order:
      // terms → demographics → instructions → questions. Computing it once
      // (rather than reactively from session.demographics) means saving
      // demographics mid-flow can't drop the gate and skip the next step.
      const demoDone = !!(s.demographics && Object.keys(s.demographics).length > 0);
      const applicable: GateStep[] = [];
      if (inst.disclaimer && inst.disclaimer.trim()) applicable.push('terms');
      if (!demoDone) applicable.push('demographics');
      if (inst.showInstructions && inst.instructions && inst.instructions.trim()) {
        applicable.push('instructions');
      }
      applicable.push('questions');

      setSession(s);
      setInstrument(inst);
      // Resume fix: restore previously-saved answers so resuming keeps them.
      setAnswers(s.answers || {});
      setSteps(applicable);
    })().catch(() => {
      if (!cancelled) setLoadError('Failed to load the assessment.');
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, user]);

  // Active demographic fields for this questionnaire (empty opt-in = all active).
  const activeDemoFields = useMemo(() => {
    if (!instrument) return [];
    const keys = instrument.demographicFieldKeys || [];
    if (keys.length === 0) return demoCatalog;
    const keySet = new Set(keys);
    return demoCatalog.filter((f) => keySet.has(f.fieldKey));
  }, [instrument, demoCatalog]);

  // Whether demographics were captured before this load — drives alreadyStarted
  // (a true resume should not re-fire the first-answer ping). Deriving it from
  // the loaded session is stable for the flow; it is NOT used to build `steps`.
  const demographicsAlreadyDone = !!(session?.demographics && Object.keys(session.demographics).length > 0);

  if (loadError) return <ErrorCard message={loadError} onAction={backToList} />;
  if (!session || !instrument || !user || steps.length === 0) return <ScreenLoader />;

  const title = instrument.name;
  const subtitle = `${user.name} · Assessment ${session.id}`;

  if (done) return <CompleteStep session={session} respondentName={user.name} onBackToList={backToList} />;

  if (instrument.questions.length === 0) {
    return <ErrorCard message="This assessment has no questions yet." actionLabel="Back" onAction={backToList} />;
  }

  const goNext = () => setStepIndex((i) => i + 1);
  const current: GateStep = steps[stepIndex] ?? 'questions';
  const alreadyStarted = Boolean(
    (session.answers && Object.keys(session.answers).length > 0) || demographicsAlreadyDone,
  );

  const saveDemographics = async (clean: Record<string, string>) => {
    await portalSessionsApi.update(session.id, { demographics: clean });
    goNext();
  };

  const submit = async () => {
    setSubmitting(true);
    const { mqtScores, summary } = scoreAssessment(instrument, answers);
    try {
      const updated = await portalSessionsApi.update(session.id, {
        status: 'Completed',
        score: summary,
        answers,
        mqtScores,
        completedAt: new Date().toISOString(),
      });
      setSession(updated || { ...session, completedAt: new Date().toISOString() });
    } catch {
      // Still show completion; the session stays Active if the write failed.
    }
    setDone(true);
  };

  switch (current) {
    case 'terms':
      return (
        <TermsStep
          title={title}
          subtitle={subtitle}
          disclaimer={instrument.disclaimer || ''}
          onAgree={goNext}
          onCancel={backToList}
        />
      );
    case 'demographics':
      return (
        <DemographicsStep
          title={title}
          subtitle={subtitle}
          fields={activeDemoFields}
          defaultValues={{ fullName: user.name || '' }}
          onSubmit={saveDemographics}
          onCancel={backToList}
        />
      );
    case 'instructions':
      return (
        <InstructionsStep
          title={title}
          subtitle={subtitle}
          instructions={instrument.instructions || ''}
          onContinue={goNext}
          onCancel={backToList}
        />
      );
    case 'questions':
    default:
      return (
        <QuestionRunner
          instrument={instrument}
          session={session}
          title={title}
          subtitle={subtitle}
          answers={answers}
          setAnswers={setAnswers}
          onSubmit={submit}
          submitting={submitting}
          alreadyStarted={alreadyStarted}
        />
      );
  }
}
