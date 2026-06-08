import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import { ArrowLeft, AlertTriangle, Search, Users as UsersIcon, RefreshCcw, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { assessmentsApi, type AssessmentSummary } from '@/lib/api';
import { formatDDMMYYYY } from '@/lib/helpers';

type SessionStatus = 'Active' | 'Completed' | 'Pending Review';

const statusBadgeProps: Record<SessionStatus, { variant: 'success' | 'primary' | 'warning'; appearance: 'light' }> = {
  Completed: { variant: 'success', appearance: 'light' },
  Active: { variant: 'primary', appearance: 'light' },
  'Pending Review': { variant: 'warning', appearance: 'light' },
};

export default function AssessmentRespondentsPage() {
  const params = useParams();
  const assessmentId = params.assessmentId as string | undefined;

  const [rows, setRows] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [confirmReset, setConfirmReset] = useState<AssessmentSummary | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError('');
    try {
      const list = await assessmentsApi.listByAssessment(assessmentId);
      setRows(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load respondents for this assessment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [assessmentId]);

  const doReset = async () => {
    if (!confirmReset) return;
    setResetting(true);
    setError('');
    try {
      await assessmentsApi.reset(confirmReset.id);
      setConfirmReset(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to reset this respondent’s attempt.');
    } finally {
      setResetting(false);
    }
  };

  // The header info — instrument, vertical, etc. — is the same for every
  // row in this assessment (all sessions share it), so we read it off the
  // first row to render once at the top.
  const meta = rows[0];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.respondentName || '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.status || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const counts = useMemo(() => {
    let completed = 0, active = 0, pending = 0;
    for (const r of rows) {
      if (r.status === 'Completed') completed++;
      else if (r.status === 'Pending Review') pending++;
      else active++;
    }
    return { completed, active, pending };
  }, [rows]);

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button
            onClick={() => { window.location.href = '/assessments'; }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Assessments
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <a href="/assessments" className="hover:text-foreground transition-colors">Assessments</a>
          <span>/</span>
          <span className="text-foreground font-medium">Respondents</span>
        </div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Respondents &amp; Responses</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Everyone who received this assessment, with their current response status.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Assessment header card — what this allotment is */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="size-4 text-primary" />
            {meta?.name || (meta?.instrument ? meta.instrument : 'Assessment')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Assessment ID</div>
              <div className="font-mono text-xs mt-0.5">{assessmentId || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Questionnaire</div>
              <div className="font-medium mt-0.5 truncate">{meta?.instrument || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Vertical</div>
              <div className="mt-0.5">
                {meta?.vertical
                  ? <Badge size="sm" shape="circle" variant="info" appearance="outline">{meta.vertical}</Badge>
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total respondents</div>
              <div className="font-semibold text-base mt-0.5">{rows.length}</div>
            </div>
          </div>
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge size="sm" shape="circle" variant="success" appearance="light">{counts.completed} completed</Badge>
              <Badge size="sm" shape="circle" variant="primary" appearance="light">{counts.active} active</Badge>
              <Badge size="sm" shape="circle" variant="warning" appearance="light">{counts.pending} pending review</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Respondents</CardTitle>
            <InputWrapper variant="md" className="w-64">
              <Search className="size-4" />
              <Input placeholder="Search by name or session id…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </InputWrapper>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No respondents have been assigned to this assessment.'
                : 'No respondents match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Session ID</th>
                    <th className="px-4 py-2.5 font-medium">Respondent</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Score</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium text-right">Response</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => {
                    const status = (r.status || 'Active') as SessionStatus;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs">{r.id}</td>
                        <td className="px-4 py-2.5 font-medium">{r.respondentName || '—'}</td>
                        <td className="px-4 py-2.5">
                          <Badge size="sm" shape="circle" {...statusBadgeProps[status]}>{status}</Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{r.score || '--'}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDDMMYYYY(r.createdAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {/* Sends admin into the take-assessment view for that
                              session — which renders the questions + the
                              respondent's saved answers. */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { window.location.href = `/assessments/${encodeURIComponent(r.id)}/take`; }}
                          >
                            View Response
                          </Button>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {/* Wipes this respondent's previous attempt so they
                              must take the assessment again. */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmReset(r)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !resetting && setConfirmReset(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Reset Attempt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Reset the assessment for <strong>{confirmReset.respondentName || confirmReset.id}</strong>?
                Their previous attempt — all answers and scores — will be permanently erased and they will have
                to take the assessment again. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmReset(null)} disabled={resetting}>Cancel</Button>
                <Button variant="primary" onClick={doReset} disabled={resetting} className="bg-amber-600 hover:bg-amber-700 text-white">
                  <RotateCcw className="h-3.5 w-3.5" /> {resetting ? 'Resetting…' : 'Reset'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
