import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenLoader } from '@/components/screen-loader';
import { ErrorCard } from '@/components/error-card';
import { useAuth } from '@/lib/auth';
import { portalAssessmentsApi, ApiError, type PortalAssessmentDetail } from '@/lib/api';
import { TermsStep } from './terms-step';
import { DemographicsStep } from './demographics-step';
import { InstructionsStep } from './instructions-step';
import { QuestionRunner } from './question-runner';
import { CompleteStep } from './complete-step';

type GateStep = 'terms' | 'demographics' | 'instructions' | 'questions';

// The backend's showTermsAndConditions is a per-assessment on/off switch with
// no terms body (yet) — the portal renders this standard consent text when on.
const TERMS_TEXT = `This assessment is administered by your organization or practitioner through BodhAssess.

By continuing you confirm that:
• You are taking this assessment yourself, in one sitting, without assistance.
• Your answers will be recorded and shared with the administrator who assigned this assessment to you.
• Your responses will be used for assessment and interpretation purposes only.

Answer honestly — there are no right or wrong answers unless stated otherwise in the instructions.`;

// Orchestrator for /portal/assessment/:sessionId (the attempt / mapping id).
// One backend call returns everything: assessment config, questionnaire,
// sections, questions with options, and the demographic form. Steps:
//   terms → demographics → instructions → questions → done
// Two writes per attempt: begin (demographics + consent, → ONGOING) fires as
// the respondent passes the gates, submit (all answers, → COMPLETED) at the
// end.
export default function TakePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<PortalAssessmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loadError, setLoadError] = useState('');
  // Applicable steps, frozen at load so mid-flow state changes can never
  // resync stepIndex to a now-shorter list.
  const [steps, setSteps] = useState<GateStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [begun, setBegun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  const backToList = () => navigate('/portal/assessment', { replace: true });
  const current: GateStep = steps[stepIndex] ?? 'questions';

  // Load the attempt. Ownership, ACTIVE status, and content assembly are all
  // server-side — the portal only decides which gate steps apply.
  useEffect(() => {
    if (!sessionId) {
      setLoadError('No assessment specified.');
      return;
    }
    let cancelled = false;
    portalAssessmentsApi
      .get(sessionId)
      .then((d) => {
        if (cancelled) return;
        if (d.assessmentStatus === 'COMPLETED') {
          setLoadError('This assessment has already been submitted.');
          return;
        }
        const applicable: GateStep[] = [];
        if (d.showTermsAndConditions) applicable.push('terms');
        if (d.demographicFields.length > 0) applicable.push('demographics');
        if (d.generalInstruction && d.generalInstruction.trim()) applicable.push('instructions');
        applicable.push('questions');
        setDetail(d);
        setSteps(applicable);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && [403, 404, 409].includes(e.status)) {
          setLoadError(e.serverMessage || 'Assessment not found.');
        } else if (e instanceof ApiError && e.status === 401) {
          setLoadError('Your session has expired — please sign in again.');
        } else {
          setLoadError('Failed to load the assessment.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // When the questionnaire has no demographic form, begin never fires from
  // the demographics step — fire it on reaching the questions instead so the
  // attempt still flips to ONGOING (empty form is valid then).
  useEffect(() => {
    if (!detail || begun || current !== 'questions') return;
    let cancelled = false;
    portalAssessmentsApi
      .begin(detail.respondentAssessmentMappingId, [])
      .then(() => {
        if (!cancelled) setBegun(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError ? e.serverMessage : 'Failed to start the assessment.');
      });
    return () => {
      cancelled = true;
    };
  }, [detail, begun, current]);

  if (loadError) return <ErrorCard message={loadError} onAction={backToList} />;
  if (!detail || !user || steps.length === 0) return <ScreenLoader />;

  const title = detail.assessmentName;
  const subtitle = `${user.name} · Attempt ${detail.attemptNumber}`;

  if (done) {
    return (
      <CompleteStep
        assessmentName={detail.assessmentName}
        questionnaireName={detail.questionnaireName}
        mappingId={detail.respondentAssessmentMappingId}
        respondentName={user.name}
        onBackToList={backToList}
      />
    );
  }

  if (detail.questions.length === 0) {
    return <ErrorCard message="This assessment has no questions yet." actionLabel="Back" onAction={backToList} />;
  }

  const goNext = () => setStepIndex((i) => i + 1);

  // Begin the attempt: store the form, record consent, flip to ONGOING.
  // Thrown errors surface inside the demographics step's error box.
  const saveDemographics = async (clean: Record<string, string>) => {
    const entries = Object.entries(clean).map(([fieldId, value]) => ({
      demographicFieldId: Number(fieldId),
      value,
    }));
    try {
      await portalAssessmentsApi.begin(detail.respondentAssessmentMappingId, entries);
    } catch (e) {
      throw new Error(e instanceof ApiError ? e.serverMessage : 'the API may be unreachable');
    }
    setBegun(true);
    goNext();
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const entries = Object.entries(answers).map(([questionId, optionId]) => ({
      questionId: Number(questionId),
      optionId,
    }));
    try {
      await portalAssessmentsApi.submit(detail.respondentAssessmentMappingId, entries);
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.serverMessage : 'Failed to submit — please try again.');
      setSubmitting(false);
    }
  };

  switch (current) {
    case 'terms':
      return (
        <TermsStep
          title={title}
          subtitle={subtitle}
          disclaimer={TERMS_TEXT}
          onAgree={goNext}
          onCancel={backToList}
        />
      );
    case 'demographics':
      return (
        <DemographicsStep
          title={title}
          subtitle={subtitle}
          fields={detail.demographicFields}
          defaultValues={{}}
          onSubmit={saveDemographics}
          onCancel={backToList}
        />
      );
    case 'instructions':
      return (
        <InstructionsStep
          title={title}
          subtitle={subtitle}
          instructions={detail.generalInstruction || ''}
          onContinue={goNext}
          onCancel={backToList}
        />
      );
    case 'questions':
    default:
      return (
        <QuestionRunner
          detail={detail}
          title={title}
          subtitle={subtitle}
          answers={answers}
          setAnswers={setAnswers}
          onSubmit={submit}
          submitting={submitting}
          submitError={submitError}
        />
      );
  }
}
