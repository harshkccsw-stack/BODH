import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenLoader } from '@/components/screen-loader';
import { ErrorCard } from '@/components/error-card';
import { useAuth } from '@/lib/auth';
import { isBlankRichText } from '@/lib/rich-text';
import {
  portalAssessmentsApi,
  ApiError,
  answerKey,
  parseAnswerKey,
  type PortalAnswerEntry,
  type PortalAssessmentDetail,
  type PortalQuestion,
} from '@/lib/api';
import { TermsStep } from './terms-step';
import { DemographicsStep } from './demographics-step';
import { InstructionsStep } from './instructions-step';
import { QuestionRunner } from './question-runner';
import { CompleteStep } from './complete-step';

type GateStep = 'terms' | 'demographics' | 'instructions' | 'questions';

// ── Resume helpers ──────────────────────────────────────────────────────────
// A saved snapshot arrives as submit-shaped entries; the runner keys its
// state by answer SLOT (answerKey). These rebuild the two state maps and find
// where to drop the respondent back in.

function seedAnswerMaps(saved: PortalAnswerEntry[]): {
  answers: Record<string, number[]>;
  textAnswers: Record<string, string>;
} {
  const answers: Record<string, number[]> = {};
  const textAnswers: Record<string, string> = {};
  for (const e of saved) {
    if (e.answerText != null && e.answerText.trim() !== '') {
      textAnswers[answerKey(e.questionId)] = e.answerText;
    } else if (e.optionId != null) {
      const key = answerKey(e.questionId, e.questionRowId);
      (answers[key] ??= []).push(e.optionId);
    }
  }
  return { answers, textAnswers };
}

// Mirrors the runner's slotSatisfied gates so "first unanswered" agrees with
// what the navigator will mark pending.
function questionSatisfied(
  q: PortalQuestion,
  answers: Record<string, number[]>,
  textAnswers: Record<string, string>,
): boolean {
  if (q.questionType === 'SHORT_ANSWER') {
    return (textAnswers[answerKey(q.questionId)] ?? '').trim().length > 0;
  }
  const slots =
    q.questionType === 'LIKERT_GRID'
      ? q.rows.map((r) => answerKey(q.questionId, r.questionRowId))
      : [answerKey(q.questionId)];
  return slots.every((slot) => {
    const n = (answers[slot] ?? []).length;
    return n >= q.minSelections && n <= q.maxSelections;
  });
}

function firstUnansweredIndex(
  questions: PortalQuestion[],
  answers: Record<string, number[]>,
  textAnswers: Record<string, string>,
): number {
  const idx = questions.findIndex((q) => !questionSatisfied(q, answers, textAnswers));
  // Everything answered (they quit right before submitting): land on the last
  // question, where the Submit button lives.
  return idx === -1 ? Math.max(0, questions.length - 1) : idx;
}

// The consent body is per-assessment now and arrives with the detail payload
// (`termsAndConditions`), authored in the dashboard's editor. The standard
// text that used to live here is the server's default, applied to any
// assessment that never set its own — so the portal no longer holds a copy.

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
  // questionId → the optionIds ticked. A list even for single choice, so one
  // shape covers both and the submit payload is one entry per selected
  // option — exactly the rows the server writes.
  // Keyed by answerKey(questionId[, rowId]) — see PortalAnswerEntry.
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  // Free text lives beside the picked options rather than inside them: a
  // SHORT_ANSWER has no optionIds to hold, and one map of two shapes would
  // need unwrapping at every read.
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  // Applicable steps, frozen at load so mid-flow state changes can never
  // resync stepIndex to a now-shorter list.
  const [steps, setSteps] = useState<GateStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [begun, setBegun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  // Attempt-level tally of inactivity "focus" popups dismissed in the runner.
  // In-memory only — a refresh restarts the whole attempt, so this resets to 0
  // with it (consistent). Sent to the backend with the final submission.
  const [popUpCount, setPopUpCount] = useState(0);
  // Set when the attention timer ran out and the abandon call that resets the
  // attempt failed — shown inside the stopped modal, because the respondent's
  // next step (launch it again) depends on that reset having landed.
  const [attentionResetError, setAttentionResetError] = useState('');
  // Where the runner opens. 0 on a fresh attempt; the first unanswered
  // question when a resume backfilled saved answers.
  const [startIndex, setStartIndex] = useState(0);

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
        if (d.assessmentStatus === 'ONGOING') {
          // RESUME: begin already ran (that is what made it ONGOING), so the
          // terms consent and demographic form are stored — replaying the
          // gates would wipe and re-ask the form. Straight to the questions,
          // with the Redis snapshot (if any) backfilled and the respondent
          // dropped on their first unanswered question.
          const seeded = seedAnswerMaps(d.savedAnswers ?? []);
          setAnswers(seeded.answers);
          setTextAnswers(seeded.textAnswers);
          setStartIndex(firstUnansweredIndex(d.questions, seeded.answers, seeded.textAnswers));
          setBegun(true);
          setDetail(d);
          setSteps(['questions']);
          return;
        }
        const applicable: GateStep[] = [];
        if (d.showTermsAndConditions) applicable.push('terms');
        if (d.demographicFields.length > 0) applicable.push('demographics');
        // isBlankRichText, not trim(): an author who emptied the rich-text
        // editor left "<p><br></p>" behind, and that is truthy — the
        // respondent would meet an Instructions step with nothing on it.
        if (!isBlankRichText(d.generalInstruction)) applicable.push('instructions');
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
  const subtitle = `${user.name} · ${detail.assessmentName}`;

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

  // The attention budget is gone: hand the attempt back unstarted so the
  // dashboard offers "Launch Assessment" again. Fire-and-report — the runner
  // has already stopped the attempt on screen, and the only thing left to say
  // is whether the reset landed.
  const abandonAttempt = () => {
    setAttentionResetError('');
    portalAssessmentsApi.abandon(detail.respondentAssessmentMappingId).catch((e) => {
      setAttentionResetError(
        e instanceof ApiError
          ? `This attempt could not be reset automatically (${e.serverMessage}) — please tell your administrator.`
          : 'This attempt could not be reset automatically — please tell your administrator.',
      );
    });
  };

  // Keys are answer SLOTS — a question, or one row of a grid — so a grid
  // fans out into one entry per (row, picked column). One entry per written
  // answer, with no option — the shape the submit validator expects. Shared
  // by submit and the partial-answer save, so the snapshot and the final
  // payload can never drift apart in format.
  const buildEntries = (): PortalAnswerEntry[] => {
    const entries: PortalAnswerEntry[] = Object.entries(answers).flatMap(([key, optionIds]) => {
      const { questionId, questionRowId } = parseAnswerKey(key);
      return optionIds.map((optionId) => ({ questionId, optionId, questionRowId }));
    });
    for (const [key, text] of Object.entries(textAnswers)) {
      if (!text.trim()) continue;
      entries.push({
        questionId: parseAnswerKey(key).questionId,
        optionId: null,
        questionRowId: null,
        answerText: text.trim(),
      });
    }
    return entries;
  };

  // Partial-answer snapshot — fire-and-forget: a failed save costs a future
  // backfill, never data, so the respondent is never interrupted over it.
  const savePartialAnswers = () => {
    if (!detail.savePartialAnswers || !begun) return;
    portalAssessmentsApi
      .saveProgress(detail.respondentAssessmentMappingId, buildEntries())
      .catch(() => {
        /* skipped save — the next section change tries again */
      });
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      // 200 means the submission is in — either staged in Redis with the
      // digest landing it in MySQL moments later (submissionPending), or
      // already written synchronously. The respondent's flow is identical.
      await portalAssessmentsApi.submit(detail.respondentAssessmentMappingId, buildEntries(), popUpCount);
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
          disclaimer={detail.termsAndConditions}
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
          textAnswers={textAnswers}
          setTextAnswers={setTextAnswers}
          initialIndex={startIndex}
          onPartialSave={detail.savePartialAnswers ? savePartialAnswers : undefined}
          onSubmit={submit}
          submitting={submitting}
          submitError={submitError}
          onFocusPopup={() => setPopUpCount((n) => n + 1)}
          onAttentionTimeout={abandonAttempt}
          onRestart={backToList}
          attentionResetError={attentionResetError}
        />
      );
  }
}
