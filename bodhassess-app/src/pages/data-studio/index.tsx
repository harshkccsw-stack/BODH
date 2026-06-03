'use client';

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LayoutGrid, Loader2, Plus, Table2, Users } from 'lucide-react';
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
                    <Badge
                      variant={w.access === 'OWNER' || w.access === 'ADMIN' ? 'primary' : 'secondary'}
                      appearance="light"
                      size="sm"
                    >
                      {w.access.toLowerCase()}
                    </Badge>
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
        <CreateWorkbookDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateWorkbookDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await dataStudioApi.createWorkbook({ name: name.trim(), description: description.trim() || undefined });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create workbook');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workbook</DialogTitle>
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
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
