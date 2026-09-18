import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { assessmentsApi, type AssessmentResponse } from '@/pages/assessments/assessmentApis';
import {
  reportComputationsApi,
  type ReportComputationResponse,
  type ReportRecipient,
} from './reportComputationsApi';

/**
 * Generate Reports — the operator's page. Three choices, top to bottom:
 *
 *   1. Assessment — those with an APPROVED report setup first; the rest
 *      greyed, with a link to Report Setup.
 *   2. Report     — the approved setups of that assessment: template,
 *                   approver, date, cohort size at approval.
 *   3. Who        — everyone who completed (ZIP), a selection (ZIP), or one
 *                   respondent (the PDF, inline).
 *
 * WHO receives a report is chosen HERE, at generation time, and is not stored
 * on the setup. The cohort the rules run over is the whole population either
 * way, so a percentile is the same number whoever is on the list.
 *
 * Nothing on this page changes a setup: it reads approved computations and
 * renders from them. That is why it is its own page and not the last step of
 * Report Setup — a psychometrician's screen should not be where an operator
 * presses one button every week.
 */

type Who = 'EVERYONE' | 'SELECTED' | 'ONE';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

const INPUT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow';

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/** One run this session. A persisted history arrives with `generated_report` later. */
interface Run {
  at: Date;
  assessment: string;
  report: string;
  who: string;
  count: number;
  skipped: number;
  fileName: string;
}

export default function GenerateReportsPage() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<AssessmentResponse[]>([]);
  const [computations, setComputations] = useState<ReportComputationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [computationId, setComputationId] = useState<number | null>(null);
  const [who, setWho] = useState<Who>('EVERYONE');
  const [recipients, setRecipients] = useState<ReportRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [one, setOne] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [a, c] = await Promise.all([
          assessmentsApi.getAllAssessments(),
          reportComputationsApi.getAll(),
        ]);
        setAssessments(a.data);
        setComputations(c.filter((x) => x.status !== 'ARCHIVED'));
      } catch (e: any) {
        setLoadError(errorText(e, 'Could not load the approved reports'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Approved setups per assessment — what this page can generate from. */
  const approvedBy = useMemo(() => {
    const out: Record<number, ReportComputationResponse[]> = {};
    computations.filter((c) => c.status === 'APPROVED')
      .forEach((c) => { (out[c.assessmentId] ??= []).push(c); });
    return out;
  }, [computations]);

  const orderedAssessments = useMemo(
    () => [...assessments].sort((a, b) => {
      const ra = approvedBy[a.assessmentId]?.length ? 0 : 1;
      const rb = approvedBy[b.assessmentId]?.length ? 0 : 1;
      return ra - rb || a.name.localeCompare(b.name);
    }),
    [assessments, approvedBy],
  );

  const assessment = assessments.find((a) => a.assessmentId === assessmentId) ?? null;
  const reports = assessmentId ? (approvedBy[assessmentId] ?? []) : [];
  const computation = reports.find((c) => c.reportComputationId === computationId) ?? null;

  const pickAssessment = (id: number) => {
    setAssessmentId(id);
    const first = approvedBy[id]?.[0]?.reportComputationId ?? null;
    setComputationId(first);
    setError('');
    clearPdf();
  };

  // The cohort of the chosen report: who would get one, and who would be skipped.
  useEffect(() => {
    setRecipients([]);
    setTicked(new Set());
    setOne(null);
    if (!computationId) return;
    let live = true;
    setLoadingRecipients(true);
    reportComputationsApi.recipients(computationId)
      .then((list) => {
        if (!live) return;
        setRecipients(list);
        setOne(list.find((r) => r.recipient)?.attemptId ?? null);
      })
      .catch((e) => { if (live) setError(errorText(e, 'Could not load the respondents')); })
      .finally(() => { if (live) setLoadingRecipients(false); });
    return () => { live = false; };
  }, [computationId]);

  const eligible = useMemo(() => recipients.filter((r) => r.recipient), [recipients]);
  const skipped = recipients.length - eligible.length;
  const shownRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligible.filter((r) => !q
      || r.name.toLowerCase().includes(q)
      || (r.serialId ?? '').toLowerCase().includes(q));
  }, [eligible, search]);

  const clearPdf = () => {
    setPdfUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
    setPdfName('');
  };

  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const record = (whoText: string, count: number, skippedCount: number, fileName: string) =>
    setRuns((list) => [{
      at: new Date(),
      assessment: assessment?.name ?? '',
      report: computation?.templateName ?? computation?.name ?? '',
      who: whoText,
      count,
      skipped: skippedCount,
      fileName,
    }, ...list]);

  const generate = async () => {
    if (!computation) return;
    setBusy(true);
    setError('');
    clearPdf();
    try {
      if (who === 'ONE') {
        if (!one) return;
        const { url, fileName } = await reportComputationsApi
          .reportPdf(computation.reportComputationId, one);
        const person = eligible.find((r) => r.attemptId === one);
        setPdfUrl(url);
        setPdfName(fileName);
        record(person?.name ?? 'one respondent', 1, 0, fileName);
      } else {
        const ids = who === 'SELECTED' ? [...ticked] : undefined;
        const result = await reportComputationsApi.generate(computation.reportComputationId, ids);
        saveBlob(result.blob, result.fileName);
        record(
          who === 'SELECTED' ? `${ids!.length} selected` : 'everyone who completed',
          result.count, result.skipped, result.fileName);
      }
    } catch (e: any) {
      setError(errorText(e, 'Could not generate the reports'));
    } finally {
      setBusy(false);
    }
  };

  const canGenerate = !!computation && !busy && (
    who === 'EVERYONE' ? eligible.length > 0
      : who === 'SELECTED' ? ticked.size > 0
        : one !== null);

  return (
    <div className="p-5 lg:p-7.5 space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span>BodhAssess</span><span>/</span><span>Reports</span><span>/</span>
          <span className="font-medium text-foreground">Generate Reports</span>
        </div>
        <h1 className="text-xl font-semibold">Generate reports</h1>
        <p className="text-sm text-muted-foreground">
          From an approved report setup: everyone who completed, a selection, or one person.
          Nothing here changes a setup.
        </p>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_1fr]">
          {/* ── 1. assessment ────────────────────────────────────────── */}
          <Card className="h-fit">
            <CardContent className="p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold">1 · Assessment</h2>
                <p className="text-xs text-muted-foreground">Those with an approved report first.</p>
              </div>
              {orderedAssessments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No assessments yet.</p>
              ) : (
                <div className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">
                  {orderedAssessments.map((a) => {
                    const n = approvedBy[a.assessmentId]?.length ?? 0;
                    const on = a.assessmentId === assessmentId;
                    return (
                      <button
                        key={a.assessmentId}
                        type="button"
                        disabled={n === 0}
                        onClick={() => pickAssessment(a.assessmentId)}
                        className={cn(
                          'flex w-full items-center gap-2 p-2.5 text-left text-sm',
                          on ? 'bg-primary/5 font-medium' : n > 0 ? 'hover:bg-muted/40' : 'opacity-60',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{a.name}</div>
                          <div className="text-[11px] font-normal text-muted-foreground">
                            {n > 0
                              ? `${n} approved report${n === 1 ? '' : 's'} · ${a.respondentCount} allotted`
                              : 'no approved report setup yet'}
                          </div>
                        </div>
                        {n > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {assessments.some((a) => !(approvedBy[a.assessmentId]?.length)) && (
                <button
                  className="text-xs text-muted-foreground underline hover:text-foreground hover:no-underline"
                  onClick={() => navigate('/reports/setup')}
                >
                  Set up a report for one of the others →
                </button>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-5">
            {/* ── 2. report ──────────────────────────────────────────── */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">2 · Report</h2>
                  <p className="text-xs text-muted-foreground">
                    {assessment ? `Approved setups of ${assessment.name}.` : 'Pick an assessment first.'}
                  </p>
                </div>
                {assessment && (
                  <div className="divide-y rounded-md border">
                    {reports.map((c) => (
                      <button
                        key={c.reportComputationId}
                        type="button"
                        onClick={() => { setComputationId(c.reportComputationId); setError(''); clearPdf(); }}
                        className={cn(
                          'flex w-full items-start gap-3 p-3 text-left',
                          c.reportComputationId === computationId ? 'bg-primary/5' : 'hover:bg-muted/40',
                        )}
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">{c.templateName ?? c.name}</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                              <ShieldCheck className="h-3 w-3" /> approved
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {c.approvedAt ? `Approved ${shortDate(c.approvedAt)}` : 'Approved'}
                            {c.approvedByUserId != null && ` by user #${c.approvedByUserId}`}
                            {c.approvedCohortSize != null && ` over ${c.approvedCohortSize} completed`}
                            {' · '}{c.rules.length} rule{c.rules.length === 1 ? '' : 's'}
                            {c.narrativeTags.length > 0 && ` · ${c.narrativeTags.length} AI paragraph${c.narrativeTags.length === 1 ? '' : 's'}`}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── 3. who ─────────────────────────────────────────────── */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">3 · Who</h2>
                    <p className="text-xs text-muted-foreground">
                      {computation
                        ? loadingRecipients
                          ? 'Loading the cohort…'
                          : `${eligible.length} completed and would receive a report` +
                            (skipped > 0 ? `; ${skipped} allotted but not finished are skipped.` : '.')
                        : 'Pick a report first.'}
                    </p>
                  </div>
                  {computation && (
                    <div className="flex gap-1 rounded-md border p-0.5">
                      {([
                        ['EVERYONE', 'Everyone'],
                        ['SELECTED', 'Selected'],
                        ['ONE', 'One person'],
                      ] as Array<[Who, string]>).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => { setWho(k); setError(''); clearPdf(); }}
                          className={cn(
                            'rounded px-2.5 py-1 text-xs',
                            who === k ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {computation && who !== 'EVERYONE' && (
                  <>
                    <div className="relative max-w-sm">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className={cn(INPUT_CLASS, 'pl-9')}
                        placeholder="Search by name or id…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    {who === 'SELECTED' && eligible.length > 0 && (
                      <div className="flex gap-3 text-xs">
                        <button className="underline hover:no-underline" onClick={() => setTicked(new Set(eligible.map((r) => r.attemptId)))}>
                          Select all {eligible.length}
                        </button>
                        <button className="underline hover:no-underline" onClick={() => setTicked(new Set())}>
                          Clear
                        </button>
                        <span className="ml-auto text-muted-foreground">{ticked.size} selected</span>
                      </div>
                    )}
                    <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                      {shownRecipients.length === 0 ? (
                        <p className="p-4 text-center text-xs text-muted-foreground">
                          {eligible.length === 0 ? 'Nobody has completed this assessment yet.' : 'Nothing matches.'}
                        </p>
                      ) : shownRecipients.map((r) => (
                        <label key={r.attemptId} className="flex cursor-pointer items-center gap-3 p-2.5 text-sm hover:bg-muted/40">
                          {who === 'SELECTED' ? (
                            <input
                              type="checkbox"
                              checked={ticked.has(r.attemptId)}
                              onChange={() => setTicked((s) => {
                                const next = new Set(s);
                                if (next.has(r.attemptId)) next.delete(r.attemptId); else next.add(r.attemptId);
                                return next;
                              })}
                            />
                          ) : (
                            <input
                              type="radio"
                              name="one"
                              checked={one === r.attemptId}
                              onChange={() => { setOne(r.attemptId); clearPdf(); }}
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {r.serialId && <code className="text-[11px] text-muted-foreground">{r.serialId}</code>}
                        </label>
                      ))}
                    </div>
                  </>
                )}

                {computation && who === 'EVERYONE' && eligible.length > 0 && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <Users className="h-4 w-4" />
                    One PDF per completed respondent, zipped, with a values.json that records the
                    pinned rule versions and the approval.
                  </div>
                )}

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button onClick={generate} disabled={!canGenerate}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {who === 'ONE' ? 'Open report' : who === 'SELECTED' ? `Generate ${ticked.size} as ZIP` : 'Generate all as ZIP'}
                  </Button>
                </div>

                {pdfUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium">{pdfName}</span>
                      <a
                        className="ml-auto inline-flex items-center gap-1 underline hover:no-underline"
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener"
                      >
                        <ExternalLink className="h-3 w-3" /> Open in a tab
                      </a>
                      <a className="inline-flex items-center gap-1 underline hover:no-underline" href={pdfUrl} download={pdfName}>
                        <Download className="h-3 w-3" /> Save
                      </a>
                      <button className="text-muted-foreground hover:text-foreground" onClick={clearPdf} aria-label="Close preview">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <iframe title="Report" src={pdfUrl} className="h-[70vh] w-full rounded-md border" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── this session's runs ───────────────────────────────── */}
            {runs.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <h2 className="text-sm font-semibold">Generated this session</h2>
                  <p className="text-xs text-muted-foreground">
                    Only what this browser tab has produced — a kept history is not built yet.
                  </p>
                  <div className="divide-y rounded-md border text-xs">
                    {runs.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 p-2">
                        <span className="text-muted-foreground">
                          {r.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-medium">{r.assessment}</span>
                        <span>· {r.report}</span>
                        <span>· {r.who}</span>
                        <span className="ml-auto">
                          {r.count} report{r.count === 1 ? '' : 's'}
                          {r.skipped > 0 && (
                            <span className="ml-1 inline-flex items-center gap-1 text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> {r.skipped} skipped
                            </span>
                          )}
                        </span>
                        <code className="text-muted-foreground">{r.fileName}</code>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
