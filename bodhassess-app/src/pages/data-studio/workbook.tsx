'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Loader2, Plus, Table2, Trash2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SheetView } from '@/src/components/data-studio/SheetView';
import {
  dataStudioApi, type DerivedColumn, type Sheet, type Workbook,
} from '@/lib/api';

export default function WorkbookPage() {
  const { wid } = useParams();
  const workbookId = Number(wid);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSheetId, setActiveSheetId] = useState<number | null>(null);
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const wb = await dataStudioApi.getWorkbook(workbookId);
      setWorkbook(wb);
      setActiveSheetId((prev) => prev ?? wb.sheets[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workbook');
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
  const activeSheet = workbook?.sheets.find((s) => s.id === activeSheetId) ?? null;

  // Keep the active sheet's derived columns in sync after add/delete without a full reload.
  const onColumnsChanged = (sheetId: number, columns: DerivedColumn[]) => {
    setWorkbook((wb) =>
      wb
        ? { ...wb, sheets: wb.sheets.map((s) => (s.id === sheetId ? { ...s, derivedColumns: columns } : s)) }
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

      {/* Sheet tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {workbook.sheets.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSheetId(s.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              s.id === activeSheetId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            {s.name}
          </button>
        ))}
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={() => setSheetDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New sheet
          </Button>
        )}
      </div>

      {activeSheet ? (
        <SheetView
          key={activeSheet.id}
          sheet={activeSheet}
          canEdit={!!canEdit}
          onColumnsChanged={(cols) => onColumnsChanged(activeSheet.id, cols)}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Table2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              This workbook has no sheets yet.
            </p>
            {canEdit && (
              <Button variant="primary" onClick={() => setSheetDialogOpen(true)}>
                <Plus className="h-4 w-4" /> New sheet
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {sheetDialogOpen && (
        <CreateSheetDialog
          workbookId={workbookId}
          onClose={() => setSheetDialogOpen(false)}
          onCreated={(sheet) => {
            setSheetDialogOpen(false);
            setWorkbook((wb) => (wb ? { ...wb, sheets: [...wb.sheets, sheet] } : wb));
            setActiveSheetId(sheet.id);
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
}: { workbookId: number; onClose: () => void; onCreated: (s: Sheet) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const sheet = await dataStudioApi.createSheet(workbookId, { name: name.trim() });
      onCreated(sheet);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create sheet');
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
            <Label htmlFor="sheet-name">Name</Label>
            <Input id="sheet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="All sessions" autoFocus />
          </div>
          <p className="text-xs text-muted-foreground">
            The sheet loads the live <strong>sessions</strong> view (one row per respondent). You can add
            computed columns once it's created.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  workbook, onClose, onChanged,
}: { workbook: Workbook; onClose: () => void; onChanged: () => void }) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    if (!userId.trim()) return;
    setBusy(true);
    setError('');
    try {
      await dataStudioApi.addShare(workbook.id, { sharedWithUserId: userId.trim(), role });
      setUserId('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add share');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid: string) => {
    setBusy(true);
    try {
      await dataStudioApi.removeShare(workbook.id, uid);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove share');
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
              <Label htmlFor="share-user">Expert user ID</Label>
              <Input id="share-user" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user id" />
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

          {workbook.shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {workbook.shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    {s.sharedWithUserId}
                    <Badge variant="secondary" appearance="light" size="sm">{s.role.toLowerCase()}</Badge>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(s.sharedWithUserId)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label="Remove share"
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
