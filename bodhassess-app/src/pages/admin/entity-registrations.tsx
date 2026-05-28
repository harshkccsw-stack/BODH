import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, RefreshCcw, Users, Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { entityRegistrationsApi, type EntityRegistration } from '@/lib/api';

export default function AdminEntityRegistrationsPage() {
  const [rows, setRows] = useState<EntityRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<EntityRegistration | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await entityRegistrationsApi.list());
    } catch (e: any) {
      setError(e?.message || 'Failed to load entity registrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doDelete = async () => {
    if (!confirmDelete?.id) return;
    setDeleting(true);
    try {
      await entityRegistrationsApi.delete(confirmDelete.id);
      setRows((prev) => prev.filter((r) => r.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entity Registrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Public self-signups submitted via the registration form. Review and promote into Respondents as needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
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
          <CardTitle className="text-base">{rows.length} registration{rows.length === 1 ? '' : 's'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-sm text-muted-foreground">No self-registrations yet.</p>
              <p className="text-[0.6875rem] text-muted-foreground">
                Share the public form: <span className="font-mono">/entity-registration</span>
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Company</th>
                    <th className="px-4 py-2.5 font-medium">Contact</th>
                    <th className="px-4 py-2.5 font-medium">DOB</th>
                    <th className="px-4 py-2.5 font-medium">Submitted</th>
                    <th className="px-4 py-2.5 font-medium">ID</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.companyName || '—'}</td>
                      <td className="px-4 py-2.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span>{r.email}</span>
                        </div>
                        {r.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{r.phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.dob || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[0.6875rem] text-muted-foreground">{r.id}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">Delete registration?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Permanently remove <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) from the registrations list. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
