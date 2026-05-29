import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import { AlertTriangle, ArrowLeft, RefreshCcw, Users as UsersIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  entityRegistrationsApi,
  respondentsApi,
  auditApi,
  assessmentAllotmentsApi,
  type EntityRegistration,
  type Respondent,
  type AuditLogEntry,
} from '@/lib/api';

export default function EntityDrillInPage() {
  const params = useParams();
  const id = params.id as string | undefined;

  const [entity, setEntity] = useState<EntityRegistration | null>(null);
  const [members, setMembers] = useState<Respondent[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'members' | 'allotments' | 'audit'>('members');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [e, allReps, a] = await Promise.all([
        entityRegistrationsApi.get(id),
        respondentsApi.list().catch(() => [] as Respondent[]),
        auditApi.byTarget('entity', id).catch(() => [] as AuditLogEntry[]),
      ]);
      setEntity(e);
      const memberIds = new Set(e.member_ids || []);
      setMembers(allReps.filter((r) => memberIds.has(r.id)));
      setAudit(a);
    } catch (err: any) {
      setError(err?.message || 'Failed to load entity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button
            onClick={() => { window.location.href = '/admin/entity-registrations'; }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Entities
          </button>
        </div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{entity?.companyName || entity?.name || 'Entity'}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {entity?.name ? `Contact: ${entity.name}` : ''}
              {entity?.email ? ` · ${entity.email}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entity && (
              <Badge size="sm" shape="circle" variant={entity.active ? 'success' : 'secondary'} appearance="light">
                {entity.active ? 'Active' : 'Inactive'}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className="h-3.5 w-3.5" /> Refresh
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
            {(['members', 'allotments', 'audit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : tab === 'members' ? (
            <MembersTab members={members} />
          ) : tab === 'allotments' ? (
            <AllotmentsTab entityId={id || ''} />
          ) : (
            <AuditTab entries={audit} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MembersTab({ members }: { members: Respondent[] }) {
  if (members.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <UsersIcon className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">No members linked yet.</p>
        <p className="text-[0.6875rem] text-muted-foreground">Add members from the Members button on the entity list.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Email</th>
            <th className="px-4 py-2.5 font-medium">Phone</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{m.name}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.email}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.phone || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllotmentsTab({ entityId }: { entityId: string }) {
  // Allotments live on the assessment side — we render a placeholder
  // pointing the admin back to the All Assessments page. A future
  // enhancement could query /entity/{id}/assessments to enumerate.
  void entityId; void assessmentAllotmentsApi;
  return (
    <div className="p-6 text-sm text-muted-foreground space-y-2 text-center">
      <p>Assessment allotments live per-assessment.</p>
      <p className="text-[0.6875rem]">Open <a className="underline" href="/assessments">All Assessments</a> and use the Allotees popup on each row to see which entities are mapped to it.</p>
    </div>
  );
}

function AuditTab({ entries }: { entries: AuditLogEntry[] }) {
  const sorted = useMemo(() => entries.slice().sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))), [entries]);
  if (sorted.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground text-center">No audit entries yet.</div>;
  }
  return (
    <div className="space-y-2">
      {sorted.map((e) => (
        <div key={e.id} className="border border-border rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-mono">{e.action}</span>
            <span className="text-muted-foreground">{e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}</span>
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
