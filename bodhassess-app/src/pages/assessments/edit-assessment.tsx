import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import { AlertTriangle, ArrowLeft, Check, Save, Trash2, X } from 'lucide-react';
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
  assessmentRecordsApi,
  assessmentAllotmentsApi,
  auditApi,
  entityRegistrationsApi,
  groupsApi,
  respondentsApi,
  type AssessmentRecord,
  type AssessmentStatus,
  type AssessmentAllotees,
  type AuditLogEntry,
  type EntityRegistration,
  type Group,
  type Respondent,
} from '@/lib/api';

const LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Telugu', 'Marathi',
  'Tamil', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi',
];

const STATUSES: AssessmentStatus[] = ['ACTIVE', 'CLOSED', 'PAUSED'];

export default function EditAssessmentPage() {
  const params = useParams();
  const id = params.id as string | undefined;

  const [record, setRecord] = useState<AssessmentRecord | null>(null);
  const [form, setForm] = useState({ name: '', language: 'English' });
  const [allotees, setAllotees] = useState<AssessmentAllotees | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);

  const [entities, setEntities] = useState<EntityRegistration[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [respondents, setRespondents] = useState<Respondent[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [tab, setTab] = useState<'details' | 'allotees' | 'audit'>('details');
  const [allotmentDialog, setAllotmentDialog] = useState<'entity' | 'group' | 'respondent' | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [r, a, log, ents, grps, reps] = await Promise.all([
        assessmentRecordsApi.get(id),
        assessmentAllotmentsApi.list(id),
        auditApi.byTarget('assessment', id).catch(() => [] as AuditLogEntry[]),
        entityRegistrationsApi.list().catch(() => [] as EntityRegistration[]),
        groupsApi.list().catch(() => [] as Group[]),
        respondentsApi.list().catch(() => [] as Respondent[]),
      ]);
      setRecord(r);
      setForm({ name: r.name || '', language: r.language || 'English' });
      setAllotees(a);
      setAudit(log);
      setEntities(ents.filter((e) => e.active));
      setGroups(grps);
      setRespondents(reps);
    } catch (e: any) {
      setError(e?.message || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const saveDetails = async () => {
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      const updated = await assessmentRecordsApi.update(id, { name: form.name, language: form.language });
      setRecord(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: AssessmentStatus) => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await assessmentRecordsApi.updateStatus(id, status);
      setRecord(updated);
    } catch (e: any) {
      setError(e?.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  // --- allotment helpers ---
  const addEntity = async (entityId: string, cap: number | null) => {
    if (!id) return;
    await assessmentAllotmentsApi.addEntity(id, entityId, cap);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const updateEntityCap = async (entityId: string, cap: number | null) => {
    if (!id) return;
    await assessmentAllotmentsApi.updateEntityCap(id, entityId, cap);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const removeEntity = async (entityId: string) => {
    if (!id) return;
    await assessmentAllotmentsApi.removeEntity(id, entityId);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const addGroup = async (gid: string) => {
    if (!id) return;
    await assessmentAllotmentsApi.addGroup(id, gid);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const removeGroup = async (gid: string) => {
    if (!id) return;
    await assessmentAllotmentsApi.removeGroup(id, gid);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const addRespondent = async (rid: string) => {
    if (!id) return;
    await assessmentAllotmentsApi.addRespondent(id, rid);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const removeRespondent = async (rid: string) => {
    if (!id) return;
    await assessmentAllotmentsApi.removeRespondent(id, rid);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };

  // entities already allotted (so picker can hide them)
  const allottedEntityIds = useMemo(() => new Set((allotees?.entities || []).map((a) => a.entityId)), [allotees]);
  const allottedGroupIds = useMemo(() => new Set((allotees?.groups || []).map((a) => a.groupId)), [allotees]);
  const allottedRespondentIds = useMemo(() => new Set((allotees?.respondents || []).map((a) => a.respondentId)), [allotees]);

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button onClick={() => { window.location.href = '/assessments'; }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Assessments
          </button>
        </div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{record?.name || 'Edit Assessment'}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {record?.questionnaireName ? <>Questionnaire: <strong>{record.questionnaireName}</strong></> : null}
              {record?.vertical ? <> · {record.vertical}</> : null}
            </p>
          </div>
          {record && (
            <div className="flex items-center gap-2">
              <Select value={record.status} onValueChange={(v) => changeStatus(v as AssessmentStatus)}>
                <SelectTrigger className="w-32" size="md"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
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
            {(['details', 'allotees', 'audit'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : tab === 'details' ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <Input variant="md" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Language</label>
                <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                  <SelectTrigger className="w-full" size="md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {saved && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Changes saved.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { window.location.href = '/assessments'; }} disabled={saving}>Cancel</Button>
                <Button variant="primary" onClick={saveDetails} disabled={saving}>
                  <Save className="size-4" /> {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : tab === 'allotees' ? (
            <div className="space-y-5">
              <AllotmentList
                title={`Entities (${allotees?.entities.length || 0})`}
                onAdd={() => setAllotmentDialog('entity')}
                rows={(allotees?.entities || []).map((a) => ({
                  id: a.entityId,
                  primary: a.entityName || a.entityId,
                  secondary: `${a.sessionsCount ?? 0} session${a.sessionsCount === 1 ? '' : 's'}${a.cap != null ? ` of ${a.cap}` : ' · no cap'}`,
                  extra: (
                    <Input
                      variant="sm" inputMode="numeric" placeholder="∞" className="w-16"
                      value={a.cap == null ? '' : String(a.cap)}
                      onBlur={(ev) => {
                        const v = ev.target.value.trim();
                        updateEntityCap(a.entityId, v === '' ? null : Math.max(0, Number(v) || 0));
                      }}
                      defaultValue={a.cap == null ? '' : String(a.cap)}
                      onChange={() => {}}
                    />
                  ),
                  onRemove: () => removeEntity(a.entityId),
                }))}
              />
              <AllotmentList
                title={`Groups (${allotees?.groups.length || 0})`}
                onAdd={() => setAllotmentDialog('group')}
                rows={(allotees?.groups || []).map((a) => ({
                  id: a.groupId,
                  primary: a.groupName || a.groupId,
                  secondary: '',
                  onRemove: () => removeGroup(a.groupId),
                }))}
              />
              <AllotmentList
                title={`Individual respondents (${allotees?.respondents.length || 0})`}
                onAdd={() => setAllotmentDialog('respondent')}
                rows={(allotees?.respondents || []).map((a) => ({
                  id: a.respondentId,
                  primary: a.respondentName || a.respondentId,
                  secondary: a.respondentEmail || '',
                  onRemove: () => removeRespondent(a.respondentId),
                }))}
              />
            </div>
          ) : (
            <AuditTab entries={audit} />
          )}
        </CardContent>
      </Card>

      {/* Picker dialogs */}
      {allotmentDialog === 'entity' && (
        <PickerDialog
          title="Add entity allotment"
          onClose={() => setAllotmentDialog(null)}
          items={entities.filter((e) => e.id && !allottedEntityIds.has(e.id)).map((e) => ({
            id: e.id!,
            label: e.companyName || e.name,
            sub: `Contact: ${e.name} · ${e.email} · ${(e.member_ids || []).length} member${(e.member_ids || []).length === 1 ? '' : 's'}`,
          }))}
          withCap
          onPick={async (entId, cap) => {
            await addEntity(entId, cap ?? null);
            setAllotmentDialog(null);
          }}
        />
      )}
      {allotmentDialog === 'group' && (
        <PickerDialog
          title="Add group allotment"
          onClose={() => setAllotmentDialog(null)}
          items={groups.filter((g) => !allottedGroupIds.has(g.id)).map((g) => ({
            id: g.id, label: g.name, sub: `${g.memberIds.length} member${g.memberIds.length === 1 ? '' : 's'}`,
          }))}
          onPick={async (gid) => {
            await addGroup(gid);
            setAllotmentDialog(null);
          }}
        />
      )}
      {allotmentDialog === 'respondent' && (
        <PickerDialog
          title="Add individual respondent"
          onClose={() => setAllotmentDialog(null)}
          items={respondents.filter((r) => !allottedRespondentIds.has(r.id)).map((r) => ({
            id: r.id, label: r.name, sub: r.email,
          }))}
          onPick={async (rid) => {
            await addRespondent(rid);
            setAllotmentDialog(null);
          }}
        />
      )}
    </div>
  );
}

interface AllotmentRow {
  id: string;
  primary: string;
  secondary: string;
  extra?: React.ReactNode;
  onRemove: () => void;
}
function AllotmentList({ title, rows, onAdd }: { title: string; rows: AllotmentRow[]; onAdd: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{title}</h4>
        <Button variant="outline" size="sm" onClick={onAdd}>+ Add</Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">None.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.primary}</div>
                {r.secondary && <div className="text-[0.6875rem] text-muted-foreground truncate">{r.secondary}</div>}
              </div>
              {r.extra}
              <button onClick={r.onRemove} title="Remove" className="text-muted-foreground hover:text-red-600 p-1">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PickerDialog({
  title, items, onClose, onPick, withCap,
}: {
  title: string;
  items: { id: string; label: string; sub?: string }[];
  onClose: () => void;
  onPick: (id: string, cap?: number | null) => Promise<void>;
  withCap?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [capStr, setCapStr] = useState('');
  const filtered = items.filter((i) =>
    !search.trim() || i.label.toLowerCase().includes(search.toLowerCase()) || (i.sub || '').toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <Card className="w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden flex flex-col gap-3">
          <Input variant="md" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {withCap && pendingId && (
            <div className="border border-border rounded-md p-3 text-sm space-y-2">
              <label className="block text-xs text-muted-foreground">Cap for this entity (blank = unlimited)</label>
              <Input variant="md" inputMode="numeric" placeholder="∞" value={capStr} onChange={(e) => setCapStr(e.target.value.replace(/[^0-9]/g, ''))} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPendingId(null)}>Back</Button>
                <Button variant="primary" size="sm" onClick={async () => {
                  await onPick(pendingId, capStr === '' ? null : Math.max(0, Number(capStr) || 0));
                }}>Add</Button>
              </div>
            </div>
          )}
          {!(withCap && pendingId) && (
            <div className="border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
              {filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">Nothing to add.</div>
              ) : filtered.map((i) => (
                <button key={i.id} className="w-full text-left px-4 py-2.5 text-sm border-b border-border last:border-0 hover:bg-muted/50" onClick={async () => {
                  if (withCap) { setPendingId(i.id); setCapStr(''); }
                  else await onPick(i.id);
                }}>
                  <div className="font-medium truncate">{i.label}</div>
                  {i.sub && <div className="text-[0.6875rem] text-muted-foreground truncate">{i.sub}</div>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
          {(e.before || e.after) && (
            <details className="mt-2 text-[0.6875rem] text-muted-foreground">
              <summary className="cursor-pointer">Details</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all">
{e.before ? `before: ${e.before}\n` : ''}{e.after ? `after:  ${e.after}` : ''}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
