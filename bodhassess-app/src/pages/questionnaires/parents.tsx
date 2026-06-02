import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Edit3,
  GitBranch,
  GitCommit,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { questionnaireRecordsApi, type QuestionnaireParent } from '@/lib/api';

/**
 * Parent-centric Question Bank list. One row per questionnaire family
 * (PHQ-9, GAD-7, …). Each row reveals the family's version + draft
 * counts and links into the git-style version history page where
 * admins commit drafts, switch the current pointer, and audit history.
 *
 * The legacy /questionnaires/all-questionnaires page (cards + verticals
 * sidebar) stays around — it still works against the catalog mirror.
 * This page is the version-aware entry point we wire into the sidebar.
 */
export default function QuestionnaireParentsPage() {
  const [rows, setRows] = useState<QuestionnaireParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createVertical, setCreateVertical] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<QuestionnaireParent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await questionnaireRecordsApi.list());
    } catch (e: any) {
      setError(e?.message || 'Failed to load questionnaires.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.vertical || '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const createParent = async () => {
    setCreateError('');
    if (!createName.trim()) { setCreateError('Name is required.'); return; }
    setCreateSaving(true);
    try {
      const created = await questionnaireRecordsApi.create({
        name: createName.trim(),
        vertical: createVertical.trim() || undefined,
      });
      // Land the admin in the new family's version-history page so they
      // can edit the initial draft + commit v1.0 right away.
      window.location.href = `/questionnaires/${encodeURIComponent(created.id)}/versions`;
    } catch (e: any) {
      setCreateError(e?.message || 'Failed to create questionnaire.');
      setCreateSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await questionnaireRecordsApi.delete(confirmDelete.id);
      setRows((prev) => prev.filter((r) => r.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete questionnaire.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>BodhAssess</span><span>/</span>
            <span className="text-foreground font-medium">Questionnaires</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Questionnaires (versioned)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One row per questionnaire family. Each has its own commit history — edit a
            draft, commit a new version, and pick which version is current for
            new assessments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => { setCreateName(''); setCreateVertical(''); setCreateError(''); setCreateOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Questionnaire
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
        <CardContent className="p-4">
          <InputWrapper variant="md" className="w-full sm:w-96">
            <Search className="size-4" />
            <Input placeholder="Search by name, vertical, or id…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </InputWrapper>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{filtered.length} questionnaire{filtered.length === 1 ? '' : 's'}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <GitBranch className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 ? 'No versioned questionnaires yet.' : 'No matches.'}
              </p>
              {rows.length === 0 && (
                <p className="text-[0.6875rem] text-muted-foreground">
                  Use "New Questionnaire" above to create the first one.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Vertical</th>
                    <th className="px-4 py-2.5 font-medium">Current version</th>
                    <th className="px-4 py-2.5 font-medium">Versions</th>
                    <th className="px-4 py-2.5 font-medium">Drafts</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => { window.location.href = `/questionnaires/${encodeURIComponent(r.id)}/versions`; }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="font-mono text-[0.6875rem] text-muted-foreground mt-0.5">{r.id}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.vertical ? <Badge size="sm" shape="circle" variant="info" appearance="outline">{r.vertical}</Badge> : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.currentVersionLabel ? (
                          <Badge size="sm" shape="circle" variant="success" appearance="light">
                            <GitCommit className="h-3 w-3 mr-0.5" /> {r.currentVersionLabel}
                          </Badge>
                        ) : <span className="text-muted-foreground italic">none</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">{r.versionCount ?? 0}</td>
                      <td className="px-4 py-3 text-sm">
                        {(r.draftCount ?? 0) > 0 ? (
                          <Badge size="sm" shape="circle" variant="warning" appearance="light">
                            <Edit3 className="h-3 w-3 mr-0.5" /> {r.draftCount}
                          </Badge>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button variant="outline" size="sm" onClick={() => { window.location.href = `/questionnaires/${encodeURIComponent(r.id)}/versions`; }}>
                            <GitBranch className="h-3.5 w-3.5" /> Versions <ChevronRight className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(r)} title="Delete (only if no version is in use)">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !createSaving && setCreateOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">New Questionnaire</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {createError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name *</label>
                <Input variant="md" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder='e.g., "PHQ-9 Depression Screen"' />
                <p className="text-[0.6875rem] text-muted-foreground mt-1">
                  This is the parent family. Each commit creates a new version under it.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Vertical</label>
                <Input variant="md" value={createVertical} onChange={(e) => setCreateVertical(e.target.value)} placeholder="Clinical / Industrial / Counselling / …" />
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                After creating, you'll land in the version history page with an empty
                draft. Edit content, then commit it to materialize v1.0.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>Cancel</Button>
                <Button variant="primary" onClick={createParent} disabled={createSaving}>
                  <Plus className="h-3.5 w-3.5" /> {createSaving ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !deleting && setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">Delete questionnaire family?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Permanently remove <strong>{confirmDelete.name}</strong> and all of its versions?
                This is rejected by the server if any version is locked in by an assessment.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
