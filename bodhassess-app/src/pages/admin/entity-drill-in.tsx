import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import { AlertTriangle, ArrowLeft, Layers, RefreshCcw, SlidersHorizontal, Users as UsersIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  entityRegistrationsApi,
  respondentsApi,
  auditApi,
  assessmentAllotmentsApi,
  assessmentsApi,
  type EntityRegistration,
  type Respondent,
  type AuditLogEntry,
  type AssessmentGroup,
} from '@/lib/api';

export default function EntityDrillInPage() {
  const params = useParams();
  const id = params.id as string | undefined;

  const [entity, setEntity] = useState<EntityRegistration | null>(null);
  const [members, setMembers] = useState<Respondent[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [groups, setGroups] = useState<AssessmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'members' | 'access' | 'allotments' | 'audit'>('members');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [e, allReps, a, g] = await Promise.all([
        entityRegistrationsApi.get(id),
        respondentsApi.list().catch(() => [] as Respondent[]),
        auditApi.byTarget('entity', id).catch(() => [] as AuditLogEntry[]),
        assessmentsApi.listGroups().catch(() => [] as AssessmentGroup[]),
      ]);
      setEntity(e);
      const memberIds = new Set(e.member_ids || []);
      setMembers(allReps.filter((r) => memberIds.has(r.id)));
      setAudit(a);
      setGroups(g);
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
            {(['members', 'access', 'allotments', 'audit'] as const).map((t) => (
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
          ) : tab === 'access' ? (
            <AccessTab entity={entity} groups={groups} />
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

function AccessTab({ entity, groups }: { entity: EntityRegistration | null; groups: AssessmentGroup[] }) {
  const verticals = entity?.verticals || [];
  const modules = entity?.platform_modules || [];
  const assessmentIds = entity?.assessments || [];
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.assessmentId, g.name || g.instrument || g.assessmentId);
    return m;
  }, [groups]);

  const empty = verticals.length === 0 && modules.length === 0 && assessmentIds.length === 0;
  if (empty) {
    return (
      <div className="p-6 text-center space-y-2">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">No access provisioned yet.</p>
        <p className="text-[0.6875rem] text-muted-foreground">Use the Access button on the entity list to grant verticals, platform modules, and assessments.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <Section icon={<Layers className="h-3.5 w-3.5" />} title="Verticals" count={verticals.length}>
        {verticals.length === 0 ? <Muted /> : verticals.map((v) => (
          <Badge key={v} size="sm" shape="circle" variant="info" appearance="light">{v}</Badge>
        ))}
      </Section>
      <Section icon={<SlidersHorizontal className="h-3.5 w-3.5" />} title="Platform Modules" count={modules.length}>
        {modules.length === 0 ? <Muted /> : modules.map((m) => (
          <Badge key={m} size="sm" shape="circle" variant="info" appearance="light">{m}</Badge>
        ))}
      </Section>
      <Section icon={<ArrowLeft className="h-3.5 w-3.5 rotate-180" />} title="Assessments" count={assessmentIds.length}>
        {assessmentIds.length === 0 ? <Muted /> : assessmentIds.map((a) => (
          <Badge key={a} size="sm" shape="circle" variant="success" appearance="light">{nameById.get(a) || a}</Badge>
        ))}
      </Section>
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium">
        {icon} {title}
        <span className="ml-auto normal-case tracking-normal">{count}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Muted() {
  return <span className="text-xs text-muted-foreground italic">None</span>;
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
