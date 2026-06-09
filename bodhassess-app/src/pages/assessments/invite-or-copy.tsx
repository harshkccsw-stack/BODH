import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import { AlertTriangle, ArrowLeft, Check, Download, Link as LinkIcon, QrCode, Send, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  assessmentRecordsApi,
  assessmentAllotmentsApi,
  assessmentTokensApi,
  publicTokensApi,
  entityRegistrationsApi,
  groupsApi,
  respondentsApi,
  type AssessmentRecord,
  type AssessmentAllotees,
  type AssessmentToken,
  type EntityRegistration,
  type Group,
  type Respondent,
} from '@/lib/api';

// A generated link shown in the "Generated links" list. `kind` decides the
// URL shape and whether a QR is offered ("login" links carry no token).
type LinkResult = { target: string; url: string; token: string; kind: 'register' | 'login' };

// Build the shareable URL for a token. Every link — register or login — is a
// persisted token opened at /register?token=…; the public page branches on the
// token's kind (form vs "sign in & begin"). One URL shape means QR works for both.
function urlFor(t: AssessmentToken): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/register?token=${encodeURIComponent(t.token)}`;
}

// Human label for a stored token, from its scope ids. Mirrors the labels
// fire() builds so freshly-issued and previously-saved links read the same.
function labelForToken(
  t: AssessmentToken,
  entityById: Record<string, EntityRegistration>,
  respondentById: Record<string, Respondent>,
  groups: Group[],
): string {
  const entName = (eid: string) => entityById[eid]?.companyName || entityById[eid]?.name || eid;
  const repName = (rid: string) => respondentById[rid]?.name || rid;
  if (t.entityId && t.respondentId) return `${entName(t.entityId)} → ${repName(t.respondentId)}`;
  if (t.entityId) return entName(t.entityId);
  if (t.groupId) return `Group · ${groups.find((g) => g.id === t.groupId)?.name || t.groupId}`;
  // Standalone that matched an existing account: respondent-bound + email, no
  // entity/group. Show "Standalone · email" like a fresh standalone link.
  if (t.respondentId && t.email && !t.entityId && !t.groupId) return `Standalone · ${t.email}`;
  if (t.respondentId) return repName(t.respondentId);
  if (t.email) return `Standalone · ${t.email}`;
  return 'Standalone';
}

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
  const [results, setResults] = useState<LinkResult[]>([]);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState<string | null>(null);
  // When set, the standalone "Assign this assessment to <email>?" popup is open.
  const [confirmStandalone, setConfirmStandalone] = useState<string | null>(null);
  // Which "+ Add" picker is open (add an existing-but-not-yet-allotted target).
  const [allotmentDialog, setAllotmentDialog] = useState<'entity' | 'group' | 'respondent' | null>(null);
  // When set, the QR preview popup is open for this generated link.
  const [qrModal, setQrModal] = useState<{ token: string; target: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [r, a, ents, grps, reps, existing] = await Promise.all([
          assessmentRecordsApi.get(id),
          assessmentAllotmentsApi.list(id),
          entityRegistrationsApi.list().catch(() => [] as EntityRegistration[]),
          groupsApi.list().catch(() => [] as Group[]),
          respondentsApi.list().catch(() => [] as Respondent[]),
          assessmentTokensApi.listForAssessment(id).catch(() => [] as AssessmentToken[]),
        ]);
        setRecord(r);
        setAllotees(a);
        setEntities(ents);
        setGroups(grps);
        setRespondents(reps);
        // Surface links already saved for this assessment so the admin sees the
        // existing URL instead of minting a new one each visit. Names resolve
        // from the lookups we just fetched.
        const entMap = Object.fromEntries(ents.map((e) => [e.id, e])) as Record<string, EntityRegistration>;
        const repMap = Object.fromEntries(reps.map((p) => [p.id, p])) as Record<string, Respondent>;
        // Every saved token reappears here — register and login alike — with
        // its kind (derived server-side from whether it's respondent-bound).
        setResults(existing.map((t) => ({
          target: labelForToken(t, entMap, repMap, grps),
          url: urlFor(t),
          token: t.token,
          kind: t.kind || 'register',
        })));
      } catch (e: any) {
        setError(e?.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const entityById = useMemo(() => Object.fromEntries(entities.map((e) => [e.id, e])) as Record<string, EntityRegistration>, [entities]);
  const respondentById = useMemo(() => Object.fromEntries(respondents.map((r) => [r.id, r])) as Record<string, Respondent>, [respondents]);

  // Already-allotted ids — used to filter the "+ Add" pickers down to targets
  // that exist but aren't on this assessment yet.
  const allottedEntityIds = useMemo(() => new Set((allotees?.entities || []).map((a) => a.entityId)), [allotees]);
  const allottedGroupIds = useMemo(() => new Set((allotees?.groups || []).map((a) => a.groupId)), [allotees]);
  const allottedRespondentIds = useMemo(() => new Set((allotees?.respondents || []).map((a) => a.respondentId)), [allotees]);

  // Allot an existing target, then refresh the allotees so it appears in its
  // section (and its sessions are provisioned server-side). Mirrors the
  // edit-assessment allottees tab.
  const addEntity = async (entityId: string, cap?: number | null) => {
    if (!id) return;
    await assessmentAllotmentsApi.addEntity(id, entityId, cap ?? null);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const addGroup = async (gid: string) => {
    if (!id) return;
    await assessmentAllotmentsApi.addGroup(id, gid);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };
  const addRespondent = async (rid: string) => {
    if (!id) return;
    await assessmentAllotmentsApi.addRespondent(id, rid);
    setAllotees(await assessmentAllotmentsApi.list(id));
  };

  // Merge fresh links into the on-screen list (dedupe by url) and copy them.
  const mergeAndCopy = async (newResults: LinkResult[]) => {
    if (newResults.length === 0) return;
    setResults((prev) => {
      const byUrl = new Map(prev.map((r) => [r.url, r]));
      for (const r of newResults) byUrl.set(r.url, r);
      return Array.from(byUrl.values());
    });
    const blob = newResults.map((r) => `${r.target}: ${r.url}`).join('\n');
    try { await navigator.clipboard.writeText(blob); } catch {}
  };

  const fire = async () => {
    if (!id || !record) return;
    setIssuing(true);
    setError('');
    const newResults: LinkResult[] = [];
    try {
      // Entities
      for (const eid of Array.from(entityPicks)) {
        const memberSet = memberPicks[eid];
        if (memberSet && memberSet.size > 0) {
          // Drill-in: a specific member is already a respondent, so the
          // backend returns a "login" link and assigns the assessment.
          for (const rid of Array.from(memberSet)) {
            const t = await assessmentTokensApi.issue({ assessmentId: id, entityId: eid, respondentId: rid, maxUses: 1 });
            newResults.push({ target: `${entityById[eid]?.companyName || entityById[eid]?.name || eid} → ${respondentById[rid]?.name || rid}`, url: urlFor(t), token: t.token || '', kind: t.kind || 'register' });
          }
        } else {
          // Entity-wide token — anyone with the link registers under this entity.
          const t = await assessmentTokensApi.issue({ assessmentId: id, entityId: eid });
          newResults.push({ target: entityById[eid]?.companyName || entityById[eid]?.name || eid, url: urlFor(t), token: t.token || '', kind: t.kind || 'register' });
        }
      }
      // Groups
      for (const gid of Array.from(groupPicks)) {
        const t = await assessmentTokensApi.issue({ assessmentId: id, groupId: gid });
        const gname = groups.find((g) => g.id === gid)?.name || gid;
        newResults.push({ target: `Group · ${gname}`, url: urlFor(t), token: t.token || '', kind: t.kind || 'register' });
      }
      // Individual allotted respondents — already accounts, so "login" links.
      for (const rid of Array.from(respondentPicks)) {
        const t = await assessmentTokensApi.issue({ assessmentId: id, respondentId: rid, maxUses: 1 });
        newResults.push({ target: respondentById[rid]?.name || rid, url: urlFor(t), token: t.token || '', kind: t.kind || 'register' });
      }

      await mergeAndCopy(newResults);

      // Standalone individual is gated by a confirmation popup — opened last,
      // after the other picks are processed. The Allot button runs allotStandalone().
      if (standaloneEmail.trim()) {
        setConfirmStandalone(standaloneEmail.trim());
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to issue tokens.');
    } finally {
      setIssuing(false);
    }
  };

  // Confirmed assignment for a standalone individual. The backend decides:
  // an existing account → "login" link (assessment assigned now); a new
  // person → "register" link (they fill the form).
  const allotStandalone = async () => {
    const email = confirmStandalone;
    if (!id || !email) return;
    setConfirmStandalone(null);
    setIssuing(true);
    setError('');
    try {
      const t = await assessmentTokensApi.issue({ assessmentId: id, email, maxUses: 1 });
      // Same label for both kinds; the Login/Register badge already signals
      // whether this matched an existing account.
      await mergeAndCopy([{ target: `Standalone · ${email}`, url: urlFor(t), token: t.token || '', kind: t.kind || 'register' }]);
      setStandaloneEmail('');
    } catch (e: any) {
      setError(e?.message || 'Failed to assign assessment.');
    } finally {
      setIssuing(false);
    }
  };

  const copyOne = async (url: string, target: string) => {
    try { await navigator.clipboard.writeText(url); setCopyFlash(target); setTimeout(() => setCopyFlash(null), 1500); } catch {}
  };

  // Delete a generated link — revoke the persisted token server-side, then
  // drop the row. (Both register and login links are real tokens now.)
  const deleteLink = async (r: LinkResult) => {
    if (r.token) {
      try {
        await assessmentTokensApi.revoke(r.token);
      } catch (e: any) {
        setError(e?.message || 'Failed to delete link.');
        return;
      }
    }
    setResults((prev) => prev.filter((x) => x.url !== r.url));
  };

  // Download the QR PNG for a link. The server generates it once and stores
  // it on the token, so repeat downloads stream the same image. We fetch as a
  // blob (rather than navigating) to keep a clean filename.
  const downloadQr = async (token: string, target: string) => {
    setQrBusy(token);
    try {
      const res = await fetch(publicTokensApi.qrUrl(token, window.location.origin));
      if (!res.ok) throw new Error('QR fetch failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `assessment-qr-${target.replace(/[^a-z0-9]+/gi, '-').slice(0, 32) || token.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setError(e?.message || 'Failed to download QR code.');
    } finally {
      setQrBusy(null);
    }
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
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Entities ({allotees.entities.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setAllotmentDialog('entity')}>+ Add</Button>
            </CardHeader>
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
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Groups ({allotees.groups.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setAllotmentDialog('group')}>+ Add</Button>
            </CardHeader>
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
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Individual respondents ({allotees.respondents.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setAllotmentDialog('respondent')}>+ Add</Button>
            </CardHeader>
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
                Assign this assessment to someone outside the allotments. You'll confirm before it's assigned. If they already have an
                account they get a sign-in link; otherwise a registration link.
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
                <p className="text-xs text-muted-foreground">Saved links for this assessment — each link is generated once and reused. Copy individually below.</p>
                {results.map((r) => (
                  <div key={r.url} className="flex items-center justify-between gap-2 border border-border rounded-md px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.target}</span>
                        <Badge size="sm" shape="circle" variant={r.kind === 'login' ? 'primary' : 'secondary'} appearance="light">
                          {r.kind === 'login' ? 'Login' : 'Register'}
                        </Badge>
                      </div>
                      <div className="text-[0.6875rem] text-muted-foreground truncate font-mono">{r.url}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyOne(r.url, r.target)}>
                        {copyFlash === r.target ? 'Copied!' : 'Copy'}
                      </Button>
                      {r.token && (
                        <Button variant="outline" size="sm" onClick={() => setQrModal({ token: r.token, target: r.target })}>
                          <QrCode className="size-3.5" />
                          QR
                        </Button>
                      )}
                      <button onClick={() => deleteLink(r)} title="Delete link" className="text-muted-foreground hover:text-red-600 p-1.5">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {confirmStandalone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmStandalone(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-3"><CardTitle className="text-base">Assign assessment?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Assign <span className="font-medium text-foreground">{record?.name || 'this assessment'}</span> to{' '}
                <span className="font-medium text-foreground">{confirmStandalone}</span>? If they already have an account they'll
                get a sign-in link; otherwise a registration link.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmStandalone(null)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={allotStandalone}>Allot</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {allotmentDialog === 'entity' && (
        <PickerDialog
          title="Add entity"
          onClose={() => setAllotmentDialog(null)}
          withCap
          items={entities.filter((e) => e.id && e.active && !allottedEntityIds.has(e.id)).map((e) => ({
            id: e.id!,
            label: e.companyName || e.name,
            sub: `${e.name} · ${e.email} · ${(e.member_ids || []).length} members`,
          }))}
          onPick={async (entId, cap) => { await addEntity(entId, cap ?? null); setAllotmentDialog(null); }}
        />
      )}
      {allotmentDialog === 'group' && (
        <PickerDialog
          title="Add group"
          onClose={() => setAllotmentDialog(null)}
          items={groups.filter((g) => !allottedGroupIds.has(g.id)).map((g) => ({
            id: g.id, label: g.name, sub: `${(g.memberIds || []).length} members`,
          }))}
          onPick={async (gid) => { await addGroup(gid); setAllotmentDialog(null); }}
        />
      )}
      {allotmentDialog === 'respondent' && (
        <PickerDialog
          title="Add individual respondent"
          onClose={() => setAllotmentDialog(null)}
          items={respondents.filter((r) => !allottedRespondentIds.has(r.id)).map((r) => ({
            id: r.id, label: r.name, sub: r.email,
          }))}
          onPick={async (rid) => { await addRespondent(rid); setAllotmentDialog(null); }}
        />
      )}

      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setQrModal(null)}>
          <Card className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base truncate">{qrModal.target}</CardTitle>
              <button onClick={() => setQrModal(null)} title="Close" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <img
                src={publicTokensApi.qrUrl(qrModal.token, window.location.origin)}
                alt="QR code"
                className="h-56 w-56 rounded-md border border-border bg-white p-2"
              />
              <Button variant="primary" size="sm" className="w-full" onClick={() => downloadQr(qrModal.token, qrModal.target)} disabled={qrBusy === qrModal.token}>
                <Download className="size-3.5" />
                {qrBusy === qrModal.token ? 'Preparing…' : 'Download'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Modal picker to add an existing-but-not-yet-allotted entity/group/respondent.
// Mirrors the edit-assessment allottees tab. Entities show a cap step.
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
