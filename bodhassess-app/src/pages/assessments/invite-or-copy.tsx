import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import { AlertTriangle, ArrowLeft, Check, Link as LinkIcon, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  assessmentRecordsApi,
  assessmentAllotmentsApi,
  assessmentTokensApi,
  entityRegistrationsApi,
  groupsApi,
  respondentsApi,
  type AssessmentRecord,
  type AssessmentAllotees,
  type EntityRegistration,
  type Group,
  type Respondent,
} from '@/lib/api';

/**
 * Shared invite + copy-link page. Reached from the All Assessments
 * dropdown via /assessments/:id/invite or /assessments/:id/copy-link.
 *
 * Targets:
 *   - Multi-select from the assessment's allotted entities → token per entity
 *   - Multi-select from the assessment's allotted groups   → token per group
 *   - Multi-select from the assessment's allotted individuals → respondent-bound token
 *   - Standalone individual entry — emails (sent or copied) without
 *     touching the existing allotments
 *
 * Both buttons (Send Invitation / Copy Link) issue tokens. Send +
 * delivery is a stub today — system email is config-gated; in the
 * meantime "send" copies the link and the admin pastes into their own
 * email tool.
 */
export default function InviteOrCopyPage() {
  const params = useParams();
  const id = params.id as string | undefined;

  const mode: 'invite' | 'copy' =
    typeof window !== 'undefined' && window.location.pathname.endsWith('/invite') ? 'invite' : 'copy';

  const [record, setRecord] = useState<AssessmentRecord | null>(null);
  const [allotees, setAllotees] = useState<AssessmentAllotees | null>(null);
  const [entities, setEntities] = useState<EntityRegistration[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [respondents, setRespondents] = useState<Respondent[]>([]);

  const [entityPicks, setEntityPicks] = useState<Set<string>>(new Set());
  const [groupPicks, setGroupPicks] = useState<Set<string>>(new Set());
  const [respondentPicks, setRespondentPicks] = useState<Set<string>>(new Set());
  const [memberPicks, setMemberPicks] = useState<Record<string, Set<string>>>({}); // entityId -> set of memberIds
  const [standaloneEmail, setStandaloneEmail] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [results, setResults] = useState<{ target: string; url: string }[]>([]);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [r, a, ents, grps, reps] = await Promise.all([
          assessmentRecordsApi.get(id),
          assessmentAllotmentsApi.list(id),
          entityRegistrationsApi.list().catch(() => [] as EntityRegistration[]),
          groupsApi.list().catch(() => [] as Group[]),
          respondentsApi.list().catch(() => [] as Respondent[]),
        ]);
        setRecord(r);
        setAllotees(a);
        setEntities(ents);
        setGroups(grps);
        setRespondents(reps);
      } catch (e: any) {
        setError(e?.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const entityById = useMemo(() => Object.fromEntries(entities.map((e) => [e.id, e])) as Record<string, EntityRegistration>, [entities]);
  const respondentById = useMemo(() => Object.fromEntries(respondents.map((r) => [r.id, r])) as Record<string, Respondent>, [respondents]);

  const buildUrl = (token: string) => `${window.location.origin}/register?token=${encodeURIComponent(token)}`;

  const fire = async () => {
    if (!id || !record) return;
    setIssuing(true);
    setError('');
    setResults([]);
    const newResults: { target: string; url: string }[] = [];
    try {
      // Entities
      for (const eid of Array.from(entityPicks)) {
        const memberSet = memberPicks[eid];
        if (memberSet && memberSet.size > 0) {
          // Drill-in: one token per picked member.
          for (const rid of Array.from(memberSet)) {
            const t = await assessmentTokensApi.issue({
              assessmentId: id, entityId: eid, respondentId: rid, maxUses: 1,
            });
            newResults.push({ target: `${entityById[eid]?.companyName || entityById[eid]?.name || eid} → ${respondentById[rid]?.name || rid}`, url: buildUrl(t.token) });
          }
        } else {
          // Entity-wide token — anyone with the link registers under this entity.
          const t = await assessmentTokensApi.issue({ assessmentId: id, entityId: eid });
          newResults.push({ target: entityById[eid]?.companyName || entityById[eid]?.name || eid, url: buildUrl(t.token) });
        }
      }
      // Groups
      for (const gid of Array.from(groupPicks)) {
        const t = await assessmentTokensApi.issue({ assessmentId: id, groupId: gid });
        const gname = groups.find((g) => g.id === gid)?.name || gid;
        newResults.push({ target: `Group · ${gname}`, url: buildUrl(t.token) });
      }
      // Individual allotted respondents
      for (const rid of Array.from(respondentPicks)) {
        const t = await assessmentTokensApi.issue({ assessmentId: id, respondentId: rid, maxUses: 1 });
        newResults.push({ target: respondentById[rid]?.name || rid, url: buildUrl(t.token) });
      }
      // Standalone individual — no respondentId pre-bound; on registration
      // a brand-new respondent row is created from the form.
      if (standaloneEmail.trim()) {
        const t = await assessmentTokensApi.issue({ assessmentId: id, maxUses: 1 });
        newResults.push({ target: `Standalone · ${standaloneEmail.trim()}`, url: buildUrl(t.token) });
      }

      setResults(newResults);
      // Copy all links to the clipboard joined with newlines — works for
      // both modes. Send-mode would additionally call an email backend
      // when configured.
      const blob = newResults.map((r) => `${r.target}: ${r.url}`).join('\n');
      try { await navigator.clipboard.writeText(blob); } catch {}
    } catch (e: any) {
      setError(e?.message || 'Failed to issue tokens.');
    } finally {
      setIssuing(false);
    }
  };

  const copyOne = async (url: string, target: string) => {
    try { await navigator.clipboard.writeText(url); setCopyFlash(target); setTimeout(() => setCopyFlash(null), 1500); } catch {}
  };

  const totalSelected = entityPicks.size + groupPicks.size + respondentPicks.size + (standaloneEmail.trim() ? 1 : 0);

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button onClick={() => { window.location.href = '/assessments'; }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Assessments
          </button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === 'invite' ? 'Send Invitation' : 'Copy Link'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {record?.name || 'Assessment'} · pick recipients below. Each pick produces a unique registration link.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : !allotees ? null : (
        <>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Entities ({allotees.entities.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {allotees.entities.length === 0 ? <p className="text-xs text-muted-foreground italic">No entities allotted.</p> : (
                allotees.entities.map((a) => {
                  const ent = entityById[a.entityId];
                  const picked = entityPicks.has(a.entityId);
                  const memSet = memberPicks[a.entityId] || new Set<string>();
                  return (
                    <div key={a.entityId} className={`border border-border rounded-md p-3 ${picked ? 'bg-primary/5' : ''}`}>
                      <button type="button" onClick={() => toggle(entityPicks, a.entityId, setEntityPicks)} className="flex items-center gap-2 w-full text-left">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                          {picked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="font-medium">{a.entityName || entityById[a.entityId]?.companyName || entityById[a.entityId]?.name || a.entityId}</span>
                        <Badge size="sm" shape="circle" variant="secondary" appearance="light">{(ent?.member_ids || []).length} members</Badge>
                      </button>
                      {picked && (ent?.member_ids || []).length > 0 && (
                        <div className="mt-2 ml-6 space-y-1">
                          <p className="text-[0.6875rem] text-muted-foreground">Send to specific members only (optional):</p>
                          {(ent?.member_ids || []).map((mid) => {
                            const r = respondentById[mid];
                            if (!r) return null;
                            const mPicked = memSet.has(mid);
                            return (
                              <label key={mid} className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={mPicked} onChange={() => {
                                  const next = new Set(memSet);
                                  if (next.has(mid)) next.delete(mid); else next.add(mid);
                                  setMemberPicks({ ...memberPicks, [a.entityId]: next });
                                }} />
                                <span>{r.name} · <span className="text-muted-foreground">{r.email}</span></span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Groups ({allotees.groups.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {allotees.groups.length === 0 ? <p className="text-xs text-muted-foreground italic">No groups allotted.</p> : allotees.groups.map((a) => {
                const picked = groupPicks.has(a.groupId);
                return (
                  <button key={a.groupId} type="button" onClick={() => toggle(groupPicks, a.groupId, setGroupPicks)} className={`flex items-center gap-2 w-full text-left border border-border rounded-md px-3 py-2 text-sm ${picked ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                      {picked && <Check className="h-3 w-3" />}
                    </span>
                    {a.groupName || a.groupId}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Individual respondents ({allotees.respondents.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {allotees.respondents.length === 0 ? <p className="text-xs text-muted-foreground italic">No individuals allotted.</p> : allotees.respondents.map((a) => {
                const r = respondentById[a.respondentId];
                const picked = respondentPicks.has(a.respondentId);
                return (
                  <button key={a.respondentId} type="button" onClick={() => toggle(respondentPicks, a.respondentId, setRespondentPicks)} className={`flex items-center gap-2 w-full text-left border border-border rounded-md px-3 py-2 text-sm ${picked ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                      {picked && <Check className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r?.name || a.respondentId}</p>
                      <p className="text-[0.6875rem] text-muted-foreground truncate">{r?.email}</p>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Standalone individual</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                Send the link to someone outside the assessment's allotments. They'll be registered as a fresh respondent on submit.
              </p>
              <Input variant="md" type="email" placeholder="standalone@example.com" value={standaloneEmail} onChange={(e) => setStandaloneEmail(e.target.value)} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { window.location.href = '/assessments'; }}>Cancel</Button>
            <Button variant="primary" onClick={fire} disabled={issuing || totalSelected === 0}>
              {mode === 'invite' ? <Send className="size-4" /> : <LinkIcon className="size-4" />}
              {issuing ? 'Generating links…' : mode === 'invite' ? `Send & Copy (${totalSelected})` : `Copy Link (${totalSelected})`}
            </Button>
          </div>

          {results.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Generated links</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">All links were copied to your clipboard (one per line). You can also copy individually below.</p>
                {results.map((r) => (
                  <div key={r.url} className="flex items-center justify-between gap-2 border border-border rounded-md px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.target}</div>
                      <div className="text-[0.6875rem] text-muted-foreground truncate font-mono">{r.url}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyOne(r.url, r.target)}>
                      {copyFlash === r.target ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
