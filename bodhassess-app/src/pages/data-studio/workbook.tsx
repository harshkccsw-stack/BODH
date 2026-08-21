'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft, BarChart3, Check, ChevronsUpDown, LayoutGrid, Loader2, Plus, Search, Table2, Trash2, Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SheetView } from '@/pages/data-studio/components/SheetView';
import { DashboardView } from '@/pages/data-studio/components/DashboardView';
import {
  dataStudioApis,
  dsError,
  type DsAssessmentOption,
  type DsDashboard,
  type DsDerivedColumn,
  type DsSheet,
  type DsWorkbook,
} from '@/pages/data-studio/dataStudioApis';

export default function WorkbookPage() {
  const { wid } = useParams();
  const workbookId = Number(wid);
  const [workbook, setWorkbook] = useState<DsWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'sheets' | 'dashboards'>('sheets');
  const [activeSheetId, setActiveSheetId] = useState<number | null>(null);
  const [activeDashboardId, setActiveDashboardId] = useState<number | null>(null);
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [dashboardDialogOpen, setDashboardDialogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const wb = await dataStudioApis.getWorkbook(workbookId);
      // Tolerate a payload that omits a collection rather than rendering a
      // crash: every list below maps over these unconditionally.
      wb.sheets ??= [];
      wb.dashboards ??= [];
      wb.shares ??= [];
      setWorkbook(wb);
      setActiveSheetId((prev) => prev ?? wb.sheets[0]?.dsSheetId ?? null);
      setActiveDashboardId((prev) => prev ?? wb.dashboards[0]?.dsDashboardId ?? null);
    } catch (e) {
      setError(dsError(e, 'Failed to load workbook'));
    } finally {
      setLoading(false);
    }
  }, [workbookId]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit =
    workbook?.access === 'OWNER' || workbook?.access === 'EDITOR' || workbook?.access === 'ADMIN';
  const canManage = workbook?.access === 'OWNER' || workbook?.access === 'ADMIN';
  const activeSheet = workbook?.sheets.find((s) => s.dsSheetId === activeSheetId) ?? null;
  const activeDashboard = workbook?.dashboards.find((d) => d.dsDashboardId === activeDashboardId) ?? null;

  // Keep the active sheet's derived columns in sync after add/delete without a full reload.
  const onColumnsChanged = (sheetId: number, columns: DsDerivedColumn[]) => {
    setWorkbook((wb) =>
      wb
        ? {
            ...wb,
            sheets: wb.sheets.map((s) =>
              s.dsSheetId === sheetId ? { ...s, derivedColumns: columns } : s,
            ),
          }
        : wb,
    );
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workbook…
      </div>
    );
  }

  if (error || !workbook) {
    return (
      <div className="space-y-4 p-5 lg:p-7.5">
        <Link to="/data-studio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Data Studio
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error || 'Workbook not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5 lg:p-7.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/data-studio" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Data Studio
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {workbook.name}
            <Badge
              variant={canManage ? 'primary' : 'secondary'}
              appearance="light"
              size="sm"
            >
              {workbook.access.toLowerCase()}
            </Badge>
          </h1>
          {workbook.description && (
            <p className="mt-1 text-sm text-muted-foreground">{workbook.description}</p>
          )}
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <Users className="h-4 w-4" />
            Share{workbook.shares.length ? ` (${workbook.shares.length})` : ''}
          </Button>
        )}
      </div>

      {/* Sheets / Dashboards switch */}
      <div className="flex w-fit items-center gap-1 rounded-lg border border-border p-0.5">
        <button
          onClick={() => setMode('sheets')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${mode === 'sheets' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          <Table2 className="h-4 w-4" /> Sheets
        </button>
        <button
          onClick={() => setMode('dashboards')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${mode === 'dashboards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          <LayoutGrid className="h-4 w-4" /> Dashboards
        </button>
      </div>

      {mode === 'sheets' ? (
        <>
          {/* Sheet tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            {workbook.sheets.map((s) => (
              <button
                key={s.dsSheetId}
                type="button"
                onClick={() => setActiveSheetId(s.dsSheetId)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  s.dsSheetId === activeSheetId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                {s.name}
              </button>
            ))}
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => setSheetDialogOpen(true)}>
                <Plus className="h-4 w-4" /> New sheet
              </Button>
            )}
          </div>

          {activeSheet ? (
            <SheetView
              key={activeSheet.dsSheetId}
              sheet={activeSheet}
              canEdit={!!canEdit}
              onColumnsChanged={(cols) => onColumnsChanged(activeSheet.dsSheetId, cols)}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Table2 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">This workbook has no sheets yet.</p>
                {canEdit && (
                  <Button variant="primary" onClick={() => setSheetDialogOpen(true)}>
                    <Plus className="h-4 w-4" /> New sheet
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          {/* Dashboard tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            {workbook.dashboards.map((d) => (
              <button
                key={d.dsDashboardId}
                type="button"
                onClick={() => setActiveDashboardId(d.dsDashboardId)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  d.dsDashboardId === activeDashboardId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                {d.name}
              </button>
            ))}
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => setDashboardDialogOpen(true)}>
                <Plus className="h-4 w-4" /> New dashboard
              </Button>
            )}
          </div>

          {activeDashboard ? (
            <DashboardView
              key={activeDashboard.dsDashboardId}
              dashboard={activeDashboard}
              workbook={workbook}
              canEdit={!!canEdit}
              onChanged={load}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No dashboards yet.</p>
                {canEdit && (
                  <Button variant="primary" onClick={() => setDashboardDialogOpen(true)}>
                    <Plus className="h-4 w-4" /> New dashboard
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {sheetDialogOpen && (
        <CreateSheetDialog
          workbookId={workbookId}
          onClose={() => setSheetDialogOpen(false)}
          onCreated={(sheet) => {
            setSheetDialogOpen(false);
            setWorkbook((wb) => (wb ? { ...wb, sheets: [...wb.sheets, sheet] } : wb));
            setActiveSheetId(sheet.dsSheetId);
          }}
        />
      )}

      {dashboardDialogOpen && (
        <CreateDashboardDialog
          workbookId={workbookId}
          onClose={() => setDashboardDialogOpen(false)}
          onCreated={(dash) => {
            setDashboardDialogOpen(false);
            setWorkbook((wb) => (wb ? { ...wb, dashboards: [...wb.dashboards, dash] } : wb));
            setActiveDashboardId(dash.dsDashboardId);
            setMode('dashboards');
          }}
        />
      )}

      {shareOpen && (
        <ShareDialog
          workbook={workbook}
          onClose={() => setShareOpen(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CreateSheetDialog({
  workbookId, onClose, onCreated,
}: { workbookId: number; onClose: () => void; onCreated: (s: DsSheet) => void }) {
  const [name, setName] = useState('');
  const [assessments, setAssessments] = useState<DsAssessmentOption[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<DsAssessmentOption | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dataStudioApis.listAssessments()
      .then(setAssessments)
      .catch((e) => setError(dsError(e, 'Failed to load assessments')))
      .finally(() => setLoadingList(false));
  }, []);

  const pick = (a: DsAssessmentOption) => {
    setSelected(a);
    if (!nameTouched) setName(a.name); // default sheet name to the assessment name
  };

  const create = async () => {
    if (!name.trim() || !selected) return;
    setSaving(true);
    setError('');
    try {
      const sheet = await dataStudioApis.createSheet(workbookId, {
        name: name.trim(),
        sourceFilters: { assessmentId: selected.assessmentId },
      });
      onCreated(sheet);
    } catch (e) {
      setError(dsError(e, 'Failed to create sheet'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sheet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Assessment</Label>
            <AssessmentPicker
              assessments={assessments}
              loading={loadingList}
              selected={selected}
              onPick={pick}
            />
            <p className="text-xs text-muted-foreground">
              The sheet loads <strong>every respondent allotted</strong> this assessment — one row
              each, unfinished attempts included — live from the database. Scores are blank until
              an attempt is completed, so they never drag an average down.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sheet-name">Sheet name</Label>
            <Input
              id="sheet-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              placeholder="e.g. PHQ-9 — Q2 cohort"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!name.trim() || !selected || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Searchable single-select dropdown of assessments. */
function AssessmentPicker({
  assessments, loading, selected, onPick,
}: {
  assessments: DsAssessmentOption[];
  loading: boolean;
  selected: DsAssessmentOption | null;
  onPick: (a: DsAssessmentOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? assessments.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.questionnaireName ?? '').toLowerCase().includes(q),
      )
    : assessments;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-sm"
      >
        <span className={selected ? '' : 'text-muted-foreground'}>
          {loading ? 'Loading assessments…' : selected ? selected.name : 'Select an assessment…'}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assessments…"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">No assessments match.</div>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.assessmentId}
                  type="button"
                  onClick={() => { onPick(a); setOpen(false); setQuery(''); }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${selected?.assessmentId === a.assessmentId ? 'bg-muted' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{a.name}</span>
                    {a.questionnaireName && (
                      <span className="block truncate text-xs text-muted-foreground">{a.questionnaireName}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.respondentCount ?? 0} resp.
                    {selected?.assessmentId === a.assessmentId && (
                      <Check className="ml-1 inline h-3.5 w-3.5 text-primary" />
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateDashboardDialog({
  workbookId, onClose, onCreated,
}: { workbookId: number; onClose: () => void; onCreated: (d: DsDashboard) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      onCreated(await dataStudioApis.createDashboard(workbookId, { name: name.trim() }));
    } catch (e) {
      setError(dsError(e, 'Failed to create dashboard'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New dashboard</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dash-name">Name</Label>
            <Input id="dash-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cohort overview" autoFocus />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  workbook, onClose, onChanged,
}: { workbook: DsWorkbook; onClose: () => void; onChanged: () => void }) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Adding someone already on the list is not an error — the backend updates
  // their role in place — so re-adding is how you promote a viewer.
  const add = async () => {
    const id = Number(userId.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setError('Enter the numeric user id of the dashboard account to share with');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await dataStudioApis.addShare(workbook.dsWorkbookId, { sharedWithUserId: id, role });
      setUserId('');
      onChanged();
    } catch (e) {
      setError(dsError(e, 'Failed to add share'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (sharedWithUserId: number) => {
    setBusy(true);
    setError('');
    try {
      await dataStudioApis.removeShare(workbook.dsWorkbookId, sharedWithUserId);
      onChanged();
    } catch (e) {
      setError(dsError(e, 'Failed to remove share'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share workbook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="share-user">Dashboard user ID</Label>
              <Input
                id="share-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. 6"
                inputMode="numeric"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <Button variant="primary" onClick={add} disabled={!userId.trim() || busy}>Add</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            An <strong>editor</strong> can change sheets, formulas and dashboards. A{' '}
            <strong>viewer</strong> can only read them. Neither can re-share the workbook or
            delete it — that stays with you.
          </p>

          {workbook.shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {workbook.shares.map((s) => (
                <li
                  key={s.dsWorkbookShareId}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{s.sharedWithEmail}</span>
                    <Badge variant="secondary" appearance="light" size="sm">
                      {s.role.toLowerCase()}
                    </Badge>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(s.sharedWithUserId)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Remove ${s.sharedWithEmail}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
