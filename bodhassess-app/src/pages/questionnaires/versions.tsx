import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  FlaskConical,
  GitBranch,
  GitCommit,
  Lock,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  questionnaireRecordsApi,
  questionnaireVersionsApi,
  assessmentRecordsApi,
  auditApi,
  type QuestionnaireParent,
  type QuestionnaireVersionSummary,
  type CommitVersionRequest,
  type AuditLogEntry,
  type AssessmentRecord,
  type AssessmentStatus,
} from '@/lib/api';

/** Build the public, no-login preview URL for a questionnaire version. */
function previewUrl(versionId: string): string {
  return `${window.location.origin}/preview/${encodeURIComponent(versionId)}`;
}

/**
 * Git-style version history page for a single Questionnaire family.
 *
 *   - Versions tab → all COMMITTED commits in semver-descending order
 *     with the "current" pointer marked. Actions: Set as current,
 *     Branch new draft, View content.
 *   - Drafts tab   → in-flight drafts. Actions: Edit (open the editor),
 *     Commit (modal: bump + name + comments), Discard.
 *   - Audit tab    → flat audit log for this parent.
 *
 * The editor itself reuses the existing /question-bank/create page; we
 * link to it with ?edit=<versionId>&parentId=<pid>&draftMode=1 so it loads
 * against a specific draft row.
 */
export default function QuestionnaireVersionsPage() {
  const params = useParams();
  const parentId = params.id as string | undefined;

  const [parent, setParent] = useState<QuestionnaireParent | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<'versions' | 'drafts' | 'audit'>('versions');
  const [commitTarget, setCommitTarget] = useState<QuestionnaireVersionSummary | null>(null);
  const [createDraftOpen, setCreateDraftOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<QuestionnaireVersionSummary | null>(null);

  const load = async () => {
    if (!parentId) return;
    setLoading(true); setError('');
    try {
      const [p, a] = await Promise.all([
        questionnaireRecordsApi.get(parentId),
        auditApi.byTarget('questionnaire', parentId).catch(() => [] as AuditLogEntry[]),
      ]);
      setParent(p);
      setAudit(a);
    } catch (e: any) {
      setError(e?.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [parentId]);

  const committed = useMemo(
    () => (parent?.versions || []).filter((v) => v.status === 'COMMITTED'),
    [parent],
  );
  const drafts = useMemo(
    () => (parent?.versions || []).filter((v) => v.status === 'DRAFT'),
    [parent],
  );

  const setCurrent = async (v: QuestionnaireVersionSummary) => {
    if (!parentId) return;
    try {
      const updated = await questionnaireRecordsApi.setCurrentVersion(parentId, v.id);
      setParent(updated);
    } catch (e: any) {
      setError(e?.message || 'Failed to set current version.');
    }
  };

  const discard = async () => {
    if (!parentId || !confirmDiscard) return;
    try {
      await questionnaireVersionsApi.discardDraft(parentId, confirmDiscard.id);
      setConfirmDiscard(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to discard draft.');
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button onClick={() => { window.location.href = '/questionnaires/all-questionnaires'; }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Questionnaires
          </button>
        </div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{parent?.name || 'Questionnaire'}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {parent?.vertical ? <>Vertical: <strong>{parent.vertical}</strong> · </> : null}
              {parent?.currentVersionLabel ? <>Current: <strong>{parent.currentVersionLabel}</strong></> : 'No current version yet'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreateDraftOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New Draft
            </Button>
          </div>
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
          <div className="flex items-center gap-1 border-b border-border -mb-3">
            {(['versions', 'drafts', 'audit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'versions' ? `Versions (${committed.length})` : t === 'drafts' ? `Drafts (${drafts.length})` : 'Audit'}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : tab === 'versions' ? (
            <VersionsTab
              versions={committed}
              parentId={parentId || ''}
              currentVersionId={parent?.currentVersionId}
              onSetCurrent={setCurrent}
              onBranch={async (from) => {
                if (!parentId) return;
                await questionnaireVersionsApi.createDraft(parentId, { branchedFromVersionId: from.id });
                await load();
                setTab('drafts');
              }}
            />
          ) : tab === 'drafts' ? (
            <DraftsTab
              drafts={drafts}
              parentId={parentId || ''}
              onCommit={(v) => setCommitTarget(v)}
              onDiscard={(v) => setConfirmDiscard(v)}
            />
          ) : (
            <AuditTab entries={audit} />
          )}
        </CardContent>
      </Card>

      {commitTarget && parentId && (
        <CommitModal
          parentId={parentId}
          draft={commitTarget}
          onClose={() => setCommitTarget(null)}
          onCommitted={async () => { setCommitTarget(null); await load(); setTab('versions'); }}
        />
      )}

      {createDraftOpen && parentId && (
        <CreateDraftModal
          parentId={parentId}
          committedVersions={committed}
          onClose={() => setCreateDraftOpen(false)}
          onCreated={async () => { setCreateDraftOpen(false); await load(); setTab('drafts'); }}
        />
      )}

      {confirmDiscard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDiscard(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">Discard draft?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Discard <strong>{confirmDiscard.versionName || 'this draft'}</strong>? Drafts can't be recovered after discarding.
                Committed versions are never deleted.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDiscard(null)}>Cancel</Button>
                <Button variant="primary" onClick={discard} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> Discard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Copies a public, no-login preview link for a version to the clipboard.
 * Works for both committed versions and in-flight drafts so authors can
 * walk through content before they ship it. Responses are never saved on
 * the preview page.
 */
function TestLinkButton({ versionId }: { versionId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = previewUrl(versionId);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be blocked (insecure context) — fall back to a prompt.
      window.prompt('Copy this test link:', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button
      variant="outline" size="sm" onClick={copy}
      title="Copy a public preview link (no login, responses not saved)"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <FlaskConical className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Test link'}
    </Button>
  );
}

function VersionsTab({
  versions, parentId, currentVersionId, onSetCurrent, onBranch,
}: {
  versions: QuestionnaireVersionSummary[];
  parentId: string;
  currentVersionId?: string;
  onSetCurrent: (v: QuestionnaireVersionSummary) => void;
  onBranch: (from: QuestionnaireVersionSummary) => Promise<void>;
}) {
  void parentId;
  if (versions.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <GitCommit className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">No committed versions yet.</p>
        <p className="text-[0.6875rem] text-muted-foreground">Create a draft, edit content, then commit it to materialise v1.0.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {versions.map((v) => {
        const isCurrent = currentVersionId === v.id;
        return (
          <li key={v.id} className="border border-border rounded-lg p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge size="sm" shape="circle" variant="primary" appearance="light">
                    <Lock className="h-3 w-3 mr-0.5" /> {v.versionLabel}
                  </Badge>
                  {isCurrent && (
                    <Badge size="sm" shape="circle" variant="success" appearance="light">
                      <CheckCircle2 className="h-3 w-3 mr-0.5" /> Current
                    </Badge>
                  )}
                  {(v.inUseByAssessmentCount || 0) > 0 && (
                    <Badge size="sm" shape="circle" variant="info" appearance="light">
                      In use by {v.inUseByAssessmentCount} assessment{v.inUseByAssessmentCount === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 font-medium text-sm">{v.versionName || <em className="text-muted-foreground italic">(no name)</em>}</div>
                {v.versionComments && (
                  <p className="mt-1 text-[0.6875rem] text-muted-foreground line-clamp-2">{v.versionComments}</p>
                )}
                <p className="text-[0.6875rem] text-muted-foreground mt-1">
                  Committed {v.committedAt ? new Date(v.committedAt).toLocaleString() : '—'}
                  {v.committedBy ? ` by ${v.committedBy}` : ''}
                  {v.branchedFromVersionId ? ` · branched from ${v.branchedFromVersionId}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!isCurrent && (
                  <Button variant="outline" size="sm" onClick={() => onSetCurrent(v)} title="Make this the default version for new assessments">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Set Current
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => onBranch(v)} title="Fork a new editable draft from this version">
                  <GitBranch className="h-3.5 w-3.5" /> Branch
                </Button>
                <TestLinkButton versionId={v.id} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DraftsTab({
  drafts, parentId, onCommit, onDiscard,
}: {
  drafts: QuestionnaireVersionSummary[];
  parentId: string;
  onCommit: (v: QuestionnaireVersionSummary) => void;
  onDiscard: (v: QuestionnaireVersionSummary) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No drafts in flight. Use "New Draft" above to start one.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {drafts.map((v) => (
        <li key={v.id} className="border border-border rounded-lg p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge size="sm" shape="circle" variant="warning" appearance="light">
                  <Edit3 className="h-3 w-3 mr-0.5" /> Draft
                </Badge>
                {v.branchedFromVersionId && (
                  <Badge size="sm" shape="circle" variant="info" appearance="light">
                    branched from {v.branchedFromVersionId}
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 font-medium text-sm">{v.versionName || <em className="text-muted-foreground italic">(unnamed draft)</em>}</div>
              <div className="font-mono text-[0.6875rem] text-muted-foreground mt-0.5">{v.id}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  // The existing editor opens against an id via ?edit=.
                  // The lock guard in QuestionnairesService allows the
                  // upsert because this row is DRAFT.
                  const params = new URLSearchParams();
                  params.set('edit', v.id);
                  params.set('parentId', parentId);
                  params.set('draftMode', '1');
                  window.location.href = `/question-bank/create?${params.toString()}`;
                }}
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </Button>
              <TestLinkButton versionId={v.id} />
              <Button variant="primary" size="sm" onClick={() => onCommit(v)}>
                <GitCommit className="h-3.5 w-3.5" /> Commit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDiscard(v)} title="Discard this draft">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AuditTab({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground text-center">No audit entries yet.</div>;
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div key={e.id} className="border border-border rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between gap-3 text-xs">
            <Badge size="sm" shape="circle" variant="info" appearance="light">{e.action}</Badge>
            <span className="text-muted-foreground">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}</span>
          </div>
          <div className="text-[0.6875rem] text-muted-foreground mt-1">by {e.actorName || e.actorId || 'system'}</div>
        </div>
      ))}
    </div>
  );
}

function CommitModal({
  parentId, draft, onClose, onCommitted,
}: {
  parentId: string;
  draft: QuestionnaireVersionSummary;
  onClose: () => void;
  onCommitted: () => Promise<void>;
}) {
  // Two-step flow: first review the assessments connected to this
  // questionnaire family (and optionally change their status), then fill
  // in the commit form. parentId IS the questionnaire family id.
  const [step, setStep] = useState<'review' | 'form'>('review');

  const [connected, setConnected] = useState<AssessmentRecord[]>([]);
  const [loadingConn, setLoadingConn] = useState(true);
  const [connError, setConnError] = useState('');
  const [statusSaving, setStatusSaving] = useState<string | null>(null);

  const [bump, setBump] = useState<'MAJOR' | 'MINOR'>('MINOR');
  const [name, setName] = useState(draft.versionName || '');
  const [comments, setComments] = useState('');
  const [setCurrent, setSetCurrent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoadingConn(true); setConnError('');
      try {
        setConnected(await assessmentRecordsApi.listByQuestionnaire(parentId));
      } catch (e: any) {
        setConnError(e?.message || 'Failed to load connected assessments.');
      } finally {
        setLoadingConn(false);
      }
    })();
  }, [parentId]);

  const changeStatus = async (id: string, status: AssessmentStatus) => {
    setStatusSaving(id);
    try {
      const updated = await assessmentRecordsApi.updateStatus(id, status);
      setConnected((prev) => prev.map((a) => (a.id === id ? { ...a, status: updated.status } : a)));
    } catch (e: any) {
      setConnError(e?.message || 'Failed to change status.');
    } finally {
      setStatusSaving(null);
    }
  };

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const body: CommitVersionRequest = {
        bump, versionName: name.trim(), versionComments: comments.trim(), setAsCurrent: setCurrent,
      };
      await questionnaireVersionsApi.commit(parentId, draft.id, body);
      await onCommitted();
    } catch (e: any) {
      setError(e?.message || 'Commit failed.');
      setSaving(false);
    }
  };

  const STATUS_BADGE: Record<string, 'success' | 'destructive' | 'warning' | 'info'> = {
    ACTIVE: 'success', CLOSED: 'destructive', PAUSED: 'warning', TEST: 'info',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !saving && onClose()}>
      <Card className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {step === 'review' ? 'Before you publish' : 'Commit version'}
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent className="space-y-4">
          {(error || connError) && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error || connError}</span>
            </div>
          )}

          {step === 'review' ? (
            <>
              <p className="text-sm text-muted-foreground">
                These assessments use this questionnaire. Committing a new version
                <strong> does not change </strong> them — each stays pinned to the
                version it was created with. You can pause or close any of them here first.
              </p>
              {loadingConn ? (
                <div className="p-4 text-sm text-muted-foreground">Loading connected assessments…</div>
              ) : connected.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
                  No assessments are using this questionnaire yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {connected.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 border border-border rounded-lg p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{a.name}</div>
                        <div className="text-[0.6875rem] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono">{a.questionnaireVersionLabel || a.questionnaireVersionId || '—'}</span>
                          <span>·</span>
                          <span>{a.sessionsCount ?? 0} session{(a.sessionsCount ?? 0) === 1 ? '' : 's'}</span>
                          <Badge size="sm" shape="circle" variant={STATUS_BADGE[a.status] || 'info'} appearance="light">{a.status}</Badge>
                        </div>
                      </div>
                      <Select
                        value={a.status}
                        onValueChange={(v) => changeStatus(a.id, v as AssessmentStatus)}
                        disabled={statusSaving === a.id}
                      >
                        <SelectTrigger className="w-32 shrink-0" size="sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="PAUSED">Paused</SelectItem>
                          <SelectItem value="CLOSED">Closed</SelectItem>
                          <SelectItem value="TEST">Test</SelectItem>
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={() => setStep('form')} disabled={loadingConn}>
                  Continue to commit
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Bump *</label>
                <Select value={bump} onValueChange={(v) => setBump(v as 'MAJOR' | 'MINOR')}>
                  <SelectTrigger className="w-full" size="md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MINOR">Minor (default)</SelectItem>
                    <SelectItem value="MAJOR">Major</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[0.6875rem] text-muted-foreground mt-1">
                  Minor → v1.2 becomes v1.3. Major → v1.2 becomes v2.0.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Version name</label>
                <Input variant="md" value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g., "After clinical feedback"' />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Commit comments</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="What changed and why?"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5" checked={setCurrent} onChange={(e) => setSetCurrent(e.target.checked)} />
                <span>
                  Set as current version <span className="text-muted-foreground">(only changes the default for <em>new</em> assessments — assessments already live are never affected)</span>
                </span>
              </label>
              <div className="flex justify-between gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep('review')} disabled={saving}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                  <Button variant="primary" onClick={submit} disabled={saving}>
                    <GitCommit className="h-3.5 w-3.5" /> {saving ? 'Committing…' : 'Commit'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateDraftModal({
  parentId, committedVersions, onClose, onCreated,
}: {
  parentId: string;
  committedVersions: QuestionnaireVersionSummary[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [origin, setOrigin] = useState<'blank' | string>(committedVersions[0]?.id || 'blank');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true); setError('');
    try {
      await questionnaireVersionsApi.createDraft(parentId, {
        branchedFromVersionId: origin === 'blank' ? null : origin,
        initialName: name.trim() || undefined,
      });
      await onCreated();
    } catch (e: any) {
      setError(e?.message || 'Failed to create draft.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !saving && onClose()}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">New Draft</CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Start from</label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger className="w-full" size="md"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">Blank draft (no content)</SelectItem>
                {committedVersions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    Branch from {v.versionLabel}{v.versionName ? ` — ${v.versionName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Draft name (optional)</label>
            <Input variant="md" value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g., "Scoring refresh"' />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              <Plus className="h-3.5 w-3.5" /> {saving ? 'Creating…' : 'Create Draft'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
