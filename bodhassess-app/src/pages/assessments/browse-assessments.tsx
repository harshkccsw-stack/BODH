import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, Search, Users as UsersIcon, RefreshCcw, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { assessmentsApi, type AssessmentGroup } from '@/lib/api';
import { formatDDMMYYYY } from '@/lib/helpers';

export default function BrowseAssessmentsPage() {
  const [groups, setGroups] = useState<AssessmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setGroups(await assessmentsApi.listGroups());
    } catch (e: any) {
      setError(e?.message || 'Failed to load assessments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        (g.name || '').toLowerCase().includes(q) ||
        (g.instrument || '').toLowerCase().includes(q) ||
        (g.instrumentFullName || '').toLowerCase().includes(q) ||
        (g.vertical || '').toLowerCase().includes(q) ||
        g.assessmentId.toLowerCase().includes(q),
    );
  }, [groups, search]);

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
          <span className="text-foreground font-medium">Browse</span>
        </div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Browse by Assessment</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pick an assessment to see who received it and inspect their responses.
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">{groups.length} assessment{groups.length === 1 ? '' : 's'}</CardTitle>
            <InputWrapper variant="md" className="w-72">
              <Search className="size-4" />
              <Input placeholder="Search by name, questionnaire, vertical…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </InputWrapper>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <UsersIcon className="h-5 w-5" />
              </div>
              <p className="text-sm text-muted-foreground">
                {groups.length === 0
                  ? 'No assessments created yet. Create one from the Assessments page.'
                  : 'No assessments match your search.'}
              </p>
              {groups.length === 0 && (
                <p className="text-[0.6875rem] text-muted-foreground">
                  Older assessments created before this page existed may not appear here — only ones tagged with an assessment group id.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Questionnaire</th>
                    <th className="px-4 py-2.5 font-medium">Vertical</th>
                    <th className="px-4 py-2.5 font-medium">Respondents</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((g) => (
                    <tr key={g.assessmentId} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{g.name || <span className="italic text-muted-foreground">Untitled</span>}</div>
                        <div className="font-mono text-[0.6875rem] text-muted-foreground mt-0.5">{g.assessmentId}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium truncate max-w-[18rem]">{g.instrumentFullName || g.instrument || '—'}</div>
                        {g.language && <div className="text-xs text-muted-foreground mt-0.5">{g.language}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        {g.vertical
                          ? <Badge size="sm" shape="circle" variant="info" appearance="outline">{g.vertical}</Badge>
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold">{g.respondentCount}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {g.completedCount > 0 && (
                            <Badge size="sm" shape="circle" variant="success" appearance="light">{g.completedCount} done</Badge>
                          )}
                          {g.activeCount > 0 && (
                            <Badge size="sm" shape="circle" variant="primary" appearance="light">{g.activeCount} active</Badge>
                          )}
                          {g.pendingReviewCount > 0 && (
                            <Badge size="sm" shape="circle" variant="warning" appearance="light">{g.pendingReviewCount} pending</Badge>
                          )}
                          {g.respondentCount === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDDMMYYYY(g.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { window.location.href = `/assessments/${encodeURIComponent(g.assessmentId)}/respondents`; }}
                        >
                          <UsersIcon className="size-3.5" />
                          Respondents
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
