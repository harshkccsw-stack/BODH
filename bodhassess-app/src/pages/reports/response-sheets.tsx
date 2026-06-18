import { useEffect, useMemo, useState } from 'react';
import {
  assessmentsApi,
  questionnairesApi,
  readMqtScores,
  type Assessment,
  type MQT,
  type PublishedQuestionnaire,
} from '@/lib/api';
import { formatDDMMYYYY, formatDDMMYYYYTime } from '@/lib/helpers';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  MessageSquareText,
  Search,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// A flat row for the list — one per completed session, mirroring the Reports page.
interface SheetRow {
  id: string;
  sessionId: string;
  respondent: string;
  respondentEmail?: string;
  // Assessment (allotment) name; falls back to the questionnaire name when a
  // session has no assessment name.
  assessment: string;
  instrument: string;
  generatedAt: string;
  // Raw ISO timestamp kept for chronological sorting (the display string sorts
  // lexicographically, which is wrong for DD/MM/YYYY).
  generatedAtRaw: string;
}

// Flatten the questionnaire's MQ tree into an mqt_id -> name lookup (walks
// nested `children` so traits at any depth resolve to a readable label).
function buildMqtNameMap(q: PublishedQuestionnaire | null): Record<string, string> {
  const map: Record<string, string> = {};
  const walk = (mqts?: MQT[]) => {
    (mqts || []).forEach((m) => {
      map[m.id] = m.name;
      if (m.children) walk(m.children);
    });
  };
  (q?.mqs || []).forEach((mq) => walk(mq.mqts));
  return map;
}

// The MQ/MQT points a single answered question contributed: question-level
// scores (always credited when answered) plus the selected option's scores.
// Mirrors the portal's scoring logic. Empty when the question is unanswered.
function responseMqtScores(
  question: PublishedQuestionnaire['questions'][number],
  answer: number | string | undefined,
  nameMap: Record<string, string>,
): Array<{ id: string; name: string; score: number }> {
  const answered =
    typeof answer === 'number' || (typeof answer === 'string' && answer.trim() !== '');
  if (!answered) return [];
  const totals: Record<string, number> = {};
  const add = (scores?: Array<{ mqt_id: string; score: number }>) => {
    (scores || []).forEach((s) => {
      totals[s.mqt_id] = (totals[s.mqt_id] || 0) + (Number(s.score) || 0);
    });
  };
  add(question.question_scores);
  if (typeof answer === 'number') {
    add(question.options?.[answer]?.scores);
  }
  return Object.entries(totals).map(([id, score]) => ({ id, name: nameMap[id] || id, score }));
}

export default function ResponseSheetsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [sessionsById, setSessionsById] = useState<Record<string, Assessment>>({});
  const [loadError, setLoadError] = useState('');

  // The session currently open in the detail panel, plus its resolved
  // questionnaire content (lazy-loaded the first time a row is opened).
  const [openSession, setOpenSession] = useState<Assessment | null>(null);
  const [openQuestionnaire, setOpenQuestionnaire] = useState<PublishedQuestionnaire | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  // Session id currently being exported (disables its download buttons).
  const [downloadingId, setDownloadingId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const list = await assessmentsApi.list();
        const completed = list.filter(
          (s) => String(s.status || '').toLowerCase() === 'completed',
        );
        const built: SheetRow[] = completed.map((s) => ({
          id: `RPT-${s.id}`,
          sessionId: s.id,
          respondent: s.respondent || '—',
          respondentEmail: s.respondentEmail,
          assessment: s.name || s.instrumentFullName || s.instrument || '—',
          instrument: s.instrumentFullName || s.instrument || '—',
          generatedAt: formatDDMMYYYY(s.completedAt || s.createdAt),
          generatedAtRaw: s.completedAt || s.createdAt || '',
        }));
        const byId: Record<string, Assessment> = {};
        completed.forEach((s) => {
          byId[s.id] = s;
        });
        setRows(built);
        setSessionsById(byId);
      } catch (e: any) {
        setLoadError(e?.message || 'Failed to load assessments');
      }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => {
        const q = searchQuery.toLowerCase();
        return (
          q === '' ||
          r.respondent.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.sessionId.toLowerCase().includes(q) ||
          r.assessment.toLowerCase().includes(q) ||
          r.instrument.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ta = a.generatedAtRaw ? new Date(a.generatedAtRaw).getTime() : 0;
        const tb = b.generatedAtRaw ? new Date(b.generatedAtRaw).getTime() : 0;
        return sortOrder === 'desc' ? tb - ta : ta - tb;
      });
  }, [rows, searchQuery, sortOrder]);

  // Resolve a session's questionnaire content (preferring the pinned version,
  // falling back to by-name lookup — the same resolution the take page uses).
  const resolveQuestionnaire = async (
    session: Assessment,
  ): Promise<PublishedQuestionnaire | null> => {
    let inst: PublishedQuestionnaire | null = null;
    if (session.questionnaireVersionId) {
      try {
        inst = await questionnairesApi.get(session.questionnaireVersionId);
      } catch {
        /* fall through to by-name */
      }
    }
    if (!inst) {
      const candidates = [
        (session.instrumentFullName || '').trim(),
        (session.instrument || '').trim(),
      ].filter(Boolean);
      for (const name of candidates) {
        try {
          const res = await questionnairesApi.getByName(name);
          if (res) {
            inst = res;
            break;
          }
        } catch {
          /* try next candidate */
        }
      }
    }
    return inst;
  };

  // Open a row: show the session immediately, then resolve its questionnaire.
  const openRow = async (sessionId: string) => {
    const session = sessionsById[sessionId];
    if (!session) return;
    setOpenSession(session);
    setOpenQuestionnaire(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const inst = await resolveQuestionnaire(session);
      if (!inst) {
        setDetailError(
          'Could not load the questionnaire content for this session. It may have been unpublished.',
        );
      } else {
        setOpenQuestionnaire(inst);
      }
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load questionnaire');
    } finally {
      setDetailLoading(false);
    }
  };

  // Export a single session's report to an .xlsx workbook: summary, MQT scores,
  // and a per-question responses sheet (question + the selected option text).
  const downloadReport = async (
    session: Assessment,
    questionnaire?: PublishedQuestionnaire | null,
  ) => {
    setDownloadingId(session.id);
    try {
      const XLSX = await import('xlsx');
      const q = questionnaire ?? (await resolveQuestionnaire(session));
      const reportId = `RPT-${session.id}`;

      // Sheet 1 — Summary (key/value).
      const summary: Array<[string, string | number]> = [
        ['Report ID', reportId],
        ['Session ID', session.id],
        ['Respondent', session.respondent || ''],
        ['Respondent Email', session.respondentEmail || ''],
        ['Assessment', session.name || session.instrumentFullName || session.instrument || ''],
        ['Questionnaire', session.instrumentFullName || session.instrument || ''],
        ['Status', session.status || ''],
        ['Completed At', formatDDMMYYYYTime(session.completedAt || session.createdAt)],
        ['Score Summary', session.score || ''],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...summary]);
      summarySheet['!cols'] = [{ wch: 20 }, { wch: 60 }];

      // Sheet 2 — MQ / MQT scores.
      const mqtRows = readMqtScores(session.mqtScores);
      const scoresSheet = XLSX.utils.aoa_to_sheet([
        ['MQT ID', 'MQT Name', 'Score'],
        ...mqtRows.map((r) => [r.key, r.name, r.score] as [string, string, number]),
      ]);
      scoresSheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 10 }];

      // Sheet 3 — Responses (one row per question: selected option + the
      // MQ/MQT points that response contributed).
      const nameMap = buildMqtNameMap(q);
      const respRows = (q?.questions || []).map((question, i) => {
        const ans = session.answers?.[question.id];
        let answerText: string;
        if (typeof ans === 'number') {
          answerText = question.options?.[ans]?.text ?? `Option ${ans + 1}`;
        } else if (typeof ans === 'string' && ans.trim() !== '') {
          answerText = ans;
        } else {
          answerText = '(not answered)';
        }
        const scoreText = responseMqtScores(question, ans, nameMap)
          .map((s) => `${s.name}=${s.score}`)
          .join(', ');
        return [i + 1, question.stem, answerText, scoreText] as [number, string, string, string];
      });
      const respSheet = XLSX.utils.aoa_to_sheet([
        ['#', 'Question', 'Answer', 'MQ/MQT Scores'],
        ...respRows,
      ]);
      respSheet['!cols'] = [{ wch: 5 }, { wch: 70 }, { wch: 50 }, { wch: 40 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Report');
      XLSX.utils.book_append_sheet(wb, scoresSheet, 'MQT Scores');
      XLSX.utils.book_append_sheet(wb, respSheet, 'Responses');

      // Filename: "<respondent>-<assessment>-report.xlsx", sanitized so the
      // OS accepts it (strip path separators / illegal chars, collapse spaces).
      const assessmentName =
        session.name || session.instrumentFullName || session.instrument || 'assessment';
      const safe = (s: string) =>
        s.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, ' ') || 'untitled';
      const fileName = `${safe(session.respondent || 'respondent')}-${safe(assessmentName)}-report.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to download report');
    } finally {
      setDownloadingId('');
    }
  };

  const closeDetail = () => {
    setOpenSession(null);
    setOpenQuestionnaire(null);
    setDetailError('');
  };

  const answeredCount = useMemo(() => {
    if (!openSession?.answers) return 0;
    return Object.values(openSession.answers).filter((v) =>
      typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined,
    ).length;
  }, [openSession]);

  const mqtNameById = useMemo(() => buildMqtNameMap(openQuestionnaire), [openQuestionnaire]);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Reports</span>
          <span>/</span>
          <span className="text-foreground font-medium">Response Sheets</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Response Sheets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Open a completed assessment to review every question and the option the respondent selected.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <InputWrapper variant="md" className="w-full sm:w-80">
            <Search className="size-4" />
            <Input
              placeholder="Search respondent, questionnaire, session…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputWrapper>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Response Sheets</CardTitle>
            <span className="text-sm text-muted-foreground">
              Showing {filteredRows.length} of {rows.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Report ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Assessment ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Assessment</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      aria-label={`Sort by date, ${sortOrder === 'desc' ? 'newest first' : 'oldest first'}`}
                    >
                      Completed
                      {sortOrder === 'desc' ? (
                        <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUp className="size-3.5" />
                      )}
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => openRow(row.sessionId)}
                  >
                    <td className="px-5 py-3 font-mono text-xs">{row.id}</td>
                    <td className="px-5 py-3 font-mono text-xs">{row.sessionId}</td>
                    <td className="px-5 py-3 font-medium">{row.respondent}</td>
                    <td className="px-5 py-3">{row.assessment}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.generatedAt}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          mode="icon"
                          aria-label="View responses"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRow(row.sessionId);
                          }}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          mode="icon"
                          aria-label="Download report"
                          disabled={downloadingId === row.sessionId}
                          onClick={(e) => {
                            e.stopPropagation();
                            const session = sessionsById[row.sessionId];
                            if (session) downloadReport(session);
                          }}
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                      No response sheets found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail panel — scrollable list of questions + the selected option */}
      {openSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
          onClick={closeDetail}
        >
          <Card
            className="w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-start justify-between pb-3 shrink-0 border-b border-border">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{openSession.respondent || '—'}</span>
                </CardTitle>
                <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                  RPT-{openSession.id}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {openSession.name || openSession.instrumentFullName || openSession.instrument} ·{' '}
                  {formatDDMMYYYYTime(openSession.completedAt || openSession.createdAt)}
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>

            <CardContent className="overflow-y-auto py-4 space-y-4">
              {/* Session meta */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Report ID</span>
                  <span className="font-mono">RPT-{openSession.id}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Session</span>
                  <span className="font-mono">{openSession.id}</span>
                </div>
                {openSession.respondentEmail && (
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Email</span>
                    <span>{openSession.respondentEmail}</span>
                  </div>
                )}
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Answered</span>
                  <span>
                    {answeredCount}
                    {openQuestionnaire ? ` / ${openQuestionnaire.questions.length}` : ''} questions
                  </span>
                </div>
              </div>

              {/* MQ / MQT scores */}
              {(() => {
                const mqtRows = readMqtScores(openSession.mqtScores);
                if (mqtRows.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      No MQT scores captured for this session.
                    </p>
                  );
                }
                return (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">MQ / MQT Scores</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      {mqtRows.map((r, i) => (
                        <div
                          key={r.key}
                          className={cn(
                            'flex justify-between px-3 py-2 text-xs',
                            i < mqtRows.length - 1 && 'border-b border-border',
                          )}
                        >
                          <span>{r.name}</span>
                          <span className="font-mono">{r.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {detailLoading && (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading responses…</p>
              )}
              {detailError && (
                <p className="text-sm text-red-600 dark:text-red-400 py-4">{detailError}</p>
              )}

              {openQuestionnaire &&
                openQuestionnaire.questions.map((q, qi) => {
                  const answer = openSession.answers?.[q.id];
                  const isMcq = typeof answer === 'number';
                  const unanswered =
                    answer === undefined ||
                    answer === null ||
                    (typeof answer === 'string' && answer.trim() === '');
                  const mqtScores = responseMqtScores(q, answer, mqtNameById);

                  return (
                    <div key={q.id} className="rounded-lg border border-border p-3.5 space-y-3">
                      <div className="flex gap-2">
                        <span className="text-xs font-semibold text-muted-foreground shrink-0 mt-0.5">
                          Q{qi + 1}
                        </span>
                        <p className="text-sm font-medium leading-snug">{q.stem}</p>
                      </div>

                      {unanswered ? (
                        <p className="text-xs italic text-muted-foreground pl-6">Not answered</p>
                      ) : isMcq ? (
                        // Show only the option the respondent selected.
                        <div className="pl-6">
                          <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-sm font-medium">
                            <CheckCircle2 className="size-4 text-primary shrink-0" />
                            <span>{q.options?.[answer]?.text ?? `Option ${answer + 1}`}</span>
                            <Badge
                              size="sm"
                              shape="circle"
                              variant="primary"
                              appearance="light"
                              className="ml-auto"
                            >
                              Selected
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        // Free text — show the verbatim response.
                        <div className="pl-6">
                          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                            <MessageSquareText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                            <span className="whitespace-pre-wrap">{String(answer)}</span>
                          </div>
                        </div>
                      )}

                      {/* MQ/MQT points this response contributed */}
                      {mqtScores.length > 0 && (
                        <div className="pl-6 flex flex-wrap items-center gap-1.5">
                          <span className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                            MQ / MQT
                          </span>
                          {mqtScores.map((m) => (
                            <Badge
                              key={m.id}
                              size="sm"
                              shape="circle"
                              variant="secondary"
                              appearance="light"
                            >
                              {m.name}: {m.score}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

              {openQuestionnaire && openQuestionnaire.questions.length === 0 && !detailLoading && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  This questionnaire has no questions.
                </p>
              )}
            </CardContent>

            <div className="flex justify-end gap-2 px-6 py-3 border-t border-border shrink-0">
              <Button variant="outline" onClick={closeDetail}>
                Close
              </Button>
              <Button
                variant="primary"
                disabled={downloadingId === openSession.id}
                onClick={() => downloadReport(openSession, openQuestionnaire)}
              >
                <Download className="size-4" />
                {downloadingId === openSession.id ? 'Downloading…' : 'Download'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
