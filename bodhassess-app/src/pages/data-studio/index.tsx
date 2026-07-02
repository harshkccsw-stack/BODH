'use client';

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LayoutGrid, Loader2, Pencil, Plus, Table2, Trash2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { dataStudioApi, type Workbook } from '@/lib/api';

export default function DataStudioHome() {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Workbook | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workbook | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setWorkbooks(await dataStudioApi.listWorkbooks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workbooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-7 p-5 lg:p-7.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span>BodhAssess</span>
            <span>/</span>
            <span>Data Studio</span>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Data Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build spreadsheets and dashboards over live assessment data. Add computed columns
            with formulas, share workbooks with other experts.
          </p>
        </div>
        <Button variant="primary" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New workbook
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : workbooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Table2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No workbooks yet. Create your first one to start analysing assessment data.
            </p>
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New workbook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workbooks.map((w) => (
            <Link key={w.id} to={`/data-studio/wb/${w.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{w.name}</h3>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={w.access === 'OWNER' || w.access === 'ADMIN' ? 'primary' : 'secondary'}
                        appearance="light"
                        size="sm"
                      >
                        {w.access.toLowerCase()}
                      </Badge>
                      {(w.access === 'OWNER' || w.access === 'ADMIN') && (
                        <>
                          <button
                            type="button"
                            aria-label="Edit workbook"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditTarget(w); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete workbook"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(w); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {w.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{w.description}</p>
                  )}
                  <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Table2 className="h-3.5 w-3.5" />
                      {w.sheets?.length ?? 0} sheets
                    </span>
                    {(w.shares?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {w.shares.length} shared
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {dialogOpen && (
        <WorkbookFormDialog
          onClose={() => setDialogOpen(false)}
          onSaved={() => { setDialogOpen(false); load(); }}
        />
      )}

      {editTarget && (
        <WorkbookFormDialog
          workbook={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}

      {deleteTarget && (
        <DeleteWorkbookDialog
          workbook={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); load(); }}
        />
      )}
    </div>
  );
}

function WorkbookFormDialog({
  workbook, onClose, onSaved,
}: { workbook?: Workbook; onClose: () => void; onSaved: () => void }) {
  const editing = !!workbook;
  const [name, setName] = useState(workbook?.name ?? '');
  const [description, setDescription] = useState(workbook?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const body = { name: name.trim(), description: description.trim() || undefined };
      if (editing) await dataStudioApi.updateWorkbook(workbook!.id, body);
      else await dataStudioApi.createWorkbook(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save workbook');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit workbook' : 'New workbook'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wb-name">Name</Label>
            <Input id="wb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q2 cohort analysis" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wb-desc">Description (optional)</Label>
            <Input id="wb-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkbookDialog({
  workbook, onClose, onDeleted,
}: { workbook: Workbook; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await dataStudioApi.deleteWorkbook(workbook.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete workbook');
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete workbook?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{workbook.name}</strong> and all its sheets,
          computed columns, and dashboards will be permanently deleted. This cannot be undone.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
