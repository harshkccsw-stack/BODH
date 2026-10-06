import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserMinus,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reportApis,
  type AttemptStatus,
  type RespondentAssessmentRow,
  type RespondentDetail,
} from '../Reports/reportApis';
import type { OrgMemberRef } from './organizationApis';

// One organization member's actions, behind the members list's Info button:
// consent status, the assessments they hold with the Reports Hub's reset
// (the SAME POST /reports/resetAssessment call — not a second reset), and
// unassigning them from the organization.

const ATTEMPT_LABEL: Record<AttemptStatus, string> = {
  NOT_STARTED: 'Not started',
  ONGOING: 'In progress',
  COMPLETED: 'Completed',
};

const ATTEMPT_STYLE: Record<AttemptStatus, string> = {
  NOT_STARTED: 'border-border bg-muted/40 text-muted-foreground',
  ONGOING: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
  COMPLETED: 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400',
};

/** Untouched allotment — a reset would have nothing to wipe (Reports Hub rule). */
function isUntouched(row: RespondentAssessmentRow) {
  return row.attemptStatus === 'NOT_STARTED'
    && row.answeredQuestions === 0
    && row.demographicResponses === 0;
}

interface Props {
  member: OrgMemberRef;
  organizationName: string;
  /** Resolves to an error message, or null once the member is out of the org. */
  onUnassign: () => Promise<string | null>;
  onClose: () => void;
}

export default function MemberInfoModal({ member, organizationName, onUnassign, onClose }: Props) {
  const [detail, setDetail] = useState<RespondentDetail | null>(null);
  const [loadError, setLoadError] = useState('');

  const [confirmReset, setConfirmReset] = useState<RespondentAssessmentRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [unassignError, setUnassignError] = useState('');

  useEffect(() => {
    let cancelled = false;
    reportApis.getRespondentDetail(member.respondentUserId)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch((e: any) => {
        if (!cancelled) setLoadError(e?.response?.data?.message || e?.message || 'Failed to load this member');
      });
    return () => { cancelled = true; };
  }, [member.respondentUserId]);

  const busy = resetting || unassigning;
  const close = () => { if (!busy) onClose(); };

  const doReset = () => {
    if (!confirmReset) return;
    setResetting(true);
    setResetError('');
    reportApis.resetAssessment(confirmReset.respondentAssessmentMappingId)
      .then((res) => {
        setDetail((current) => current && {
          ...current,
          assessments: current.assessments.map((a) =>
            a.respondentAssessmentMappingId === res.data.respondentAssessmentMappingId ? res.data : a),
        });
        setConfirmReset(null);
      })
      .catch((e: any) => {
        setResetError(e?.response?.data?.message || e?.message || 'Failed to reset this assessment');
      })
      .finally(() => setResetting(false));
  };

  const doUnassign = async () => {
    setUnassigning(true);
    setUnassignError('');
    const error = await onUnassign();
    setUnassigning(false);
    if (error) {
      setUnassignError(error);
    } else {
      onClose();
    }
  };

  // Consent comes from the detail payload (it carries consentedAt); the list
  // row's flag shows until it arrives.
  const consented = detail ? detail.consented : member.isConsented;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" onClick={close}>
      <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary shrink-0" />
              <h2 className="text-base font-semibold truncate">{member.name}</h2>
              {member.serialId && (
                <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                  {member.serialId}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <CardContent className="space-y-5 overflow-y-auto p-5">
          {/* Consent */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span className="text-sm">Consent</span>
            {consented ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-2 py-0.5 text-[0.6875rem] font-medium text-green-700 dark:text-green-400">
                <ShieldCheck className="h-3 w-3" />
                Consented
                {detail?.consentedAt && ` · ${new Date(detail.consentedAt).toLocaleDateString()}`}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                No consent
              </span>
            )}
          </div>

          {/* Assessments + reset */}
          <div>
            <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
              <ClipboardList className="h-3.5 w-3.5" /> Assessments
              {detail && <span className="ml-auto normal-case tracking-normal">{detail.assessments.length}</span>}
            </div>
            {loadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                {loadError}
              </div>
            )}
            {!detail && !loadError && (
              <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {detail && detail.assessments.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No assessments assigned to this member yet.</p>
            )}
            {detail && detail.assessments.length > 0 && (
              <ul className="divide-y divide-border border border-border rounded-lg">
                {detail.assessments.map((a) => (
                  <li key={a.respondentAssessmentMappingId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium truncate">{a.assessmentName}</span>
                        <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs', ATTEMPT_STYLE[a.attemptStatus])}>
                          {ATTEMPT_LABEL[a.attemptStatus]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Answered {a.answeredQuestions} of {a.totalQuestions}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUntouched(a) || busy}
                      title={isUntouched(a)
                        ? 'Nothing to reset — this attempt has not been started'
                        : 'Wipe the answers and let this member take it again'}
                      onClick={() => { setConfirmReset(a); setResetError(''); }}
                    >
                      <RotateCcw className="h-3 w-3" /> Reset
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Unassign */}
          <div className="rounded-lg border border-border px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Remove from {organizationName}</span>
              {!confirmUnassign && (
                <Button variant="outline" size="sm" onClick={() => { setConfirmUnassign(true); setUnassignError(''); }} disabled={busy}>
                  <UserMinus className="h-3 w-3" /> Unassign
                </Button>
              )}
            </div>
            {confirmUnassign && (
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  Their profile and assessments stay — they just leave this organization.
                </span>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setConfirmUnassign(false)} disabled={unassigning}>Cancel</Button>
                  <Button size="sm" onClick={doUnassign} disabled={unassigning} className="bg-red-600 hover:bg-red-700 text-white">
                    {unassigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                    Unassign
                  </Button>
                </div>
              </div>
            )}
            {unassignError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                {unassignError}
              </div>
            )}
          </div>
        </CardContent>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={close}>Close</Button>
        </div>
      </Card>

      {/* Layered over the info popup — the reset is not undoable. */}
      {confirmReset && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"
          onClick={(e) => { e.stopPropagation(); if (!resetting) setConfirmReset(null); }}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Reset assessment
              </div>
              <p className="text-sm">
                Reset <strong>{confirmReset.assessmentName}</strong> for <strong>{member.name}</strong>? Their{' '}
                {confirmReset.answeredQuestions} answer{confirmReset.answeredQuestions === 1 ? '' : 's'} and{' '}
                {confirmReset.demographicResponses} demographic
                {confirmReset.demographicResponses === 1 ? ' answer' : ' answers'} for it are deleted
                permanently and the assessment goes back to <em>Not started</em>, so they take it again
                from scratch. This cannot be undone.
              </p>
              {resetError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {resetError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmReset(null)} disabled={resetting}>Cancel</Button>
                <Button onClick={doReset} disabled={resetting} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {resetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  {resetting ? 'Resetting…' : 'Reset'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
