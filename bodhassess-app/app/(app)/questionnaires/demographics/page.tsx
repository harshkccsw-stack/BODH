'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { demographicFieldsApi, type DemographicField } from '@/lib/api';

type FieldType = DemographicField['type'];

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Textarea' },
];

const EMPTY: DemographicField = {
  id: '',
  fieldKey: '',
  label: '',
  type: 'text',
  required: false,
  placeholder: '',
  options: [],
  sortOrder: 100,
  active: true,
};

function slugToCamel(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export default function DemographicFieldsPage() {
  const [fields, setFields] = useState<DemographicField[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DemographicField>(EMPTY);
  const [optionsText, setOptionsText] = useState('');
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DemographicField | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await demographicFieldsApi.list();
      setFields(list);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load fields');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const stats = useMemo(() => ({
    total: fields.length,
    active: fields.filter((f) => f.active).length,
    required: fields.filter((f) => f.required && f.active).length,
  }), [fields]);

  const openAdd = () => {
    const next = Math.max(0, ...fields.map((f) => f.sortOrder)) + 10;
    setForm({ ...EMPTY, sortOrder: next });
    setOptionsText('');
    setIsEditing(false);
    setError('');
    setModalOpen(true);
  };
  const openEdit = (f: DemographicField) => {
    setForm(f);
    setOptionsText((f.options || []).join('\n'));
    setIsEditing(true);
    setError('');
    setModalOpen(true);
  };

  const submit = async () => {
    const label = form.label.trim();
    let key = form.fieldKey.trim();
    if (!label) { setError('Label is required.'); return; }
    if (!key) key = slugToCamel(label);
    if (!key) { setError('Machine key could not be derived; enter one manually.'); return; }
    if (!isEditing && fields.some((f) => f.fieldKey === key)) {
      setError(`The key "${key}" is already used by another field.`);
      return;
    }
    const options = form.type === 'select'
      ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
      : [];
    if (form.type === 'select' && options.length === 0) {
      setError('Dropdown fields need at least one option (one per line).');
      return;
    }
    const id = form.id || `df-${key.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
    setSaving(true);
    try {
      await demographicFieldsApi.upsert({
        ...form,
        id,
        fieldKey: key,
        label,
        placeholder: (form.placeholder || '').trim(),
        options,
      });
      setModalOpen(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    await demographicFieldsApi.delete(confirmDelete.id);
    setConfirmDelete(null);
    await refresh();
  };

  const toggleActive = async (f: DemographicField) => {
    await demographicFieldsApi.upsert({ ...f, active: !f.active });
    await refresh();
  };

  const move = async (f: DemographicField, dir: -1 | 1) => {
    const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((x) => x.id === f.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    await demographicFieldsApi.upsert({ ...a, sortOrder: b.sortOrder });
    await demographicFieldsApi.upsert({ ...b, sortOrder: a.sortOrder });
    await refresh();
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Questionnaire Library</span><span>/</span>
          <span className="text-foreground font-medium">Demographic Fields</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              Demographic Fields
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The catalogue of fields respondents can be asked to fill before starting an assessment.
              Each questionnaire picks which of these apply (on Create Questionnaire → Step 1). Fields added here become available everywhere automatically.
            </p>
          </div>
          <Button variant="primary" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Field
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Fields</p><p className="text-2xl font-semibold mt-1">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-semibold mt-1 text-green-600">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Required by default</p><p className="text-2xl font-semibold mt-1">{stats.required}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">All Fields</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground w-12">#</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Label</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Key</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Required</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Active</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && fields.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>
                ) : fields.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">No fields yet. Click "Add Field".</td></tr>
                ) : fields.map((f, idx) => (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <button onClick={() => move(f, -1)} disabled={idx === 0} className="p-0.5 disabled:opacity-30 hover:text-foreground"><ArrowUp className="h-3 w-3" /></button>
                        <button onClick={() => move(f, 1)} disabled={idx === fields.length - 1} className="p-0.5 disabled:opacity-30 hover:text-foreground"><ArrowDown className="h-3 w-3" /></button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{f.label}</p>
                      {f.placeholder && <p className="text-[0.6875rem] text-muted-foreground mt-0.5 truncate max-w-xs">{f.placeholder}</p>}
                      {f.options.length > 0 && (
                        <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
                          {f.options.length} option{f.options.length !== 1 ? 's' : ''}: {f.options.slice(0, 3).join(', ')}{f.options.length > 3 ? '…' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{f.fieldKey}</td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary" appearance="light" size="sm">{f.type}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {f.required ? (
                        <span className="text-xs text-amber-600">Required</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Optional</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggleActive(f)} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', f.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground')}>
                        {f.active ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                        {f.active ? 'Active' : 'Hidden'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(f)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(f)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !saving && setModalOpen(false)}>
          <Card className="w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base">{isEditing ? 'Edit Field' : 'Add Field'}</CardTitle>
              <button onClick={() => !saving && setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Label *</label>
                <input
                  value={form.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    setForm((p) => ({ ...p, label, fieldKey: isEditing ? p.fieldKey : slugToCamel(label) }));
                  }}
                  placeholder="e.g., Annual Household Income"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Machine Key *</label>
                <input
                  value={form.fieldKey}
                  onChange={(e) => setForm({ ...form, fieldKey: slugToCamel(e.target.value) })}
                  disabled={isEditing}
                  placeholder="auto-derived from label"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <p className="text-[0.6875rem] text-muted-foreground">
                  Stored on each session as the JSON key. Camel-case, no spaces. {isEditing && 'Cannot be changed after creation.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as FieldType })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Sort order</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Placeholder / helper text</label>
                <input
                  value={form.placeholder || ''}
                  onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                  placeholder="Shown inside the input when empty (optional)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {form.type === 'select' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Options (one per line) *</label>
                  <textarea
                    rows={5}
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                    placeholder={'Male\nFemale\nNon-binary\nPrefer not to say'}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-mono text-xs"
                  />
                </div>
              )}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} className="rounded" />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
                  Active
                </label>
              </div>
            </CardContent>
            <div className="shrink-0 border-t border-border px-5 py-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => !saving && setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : isEditing ? 'Save' : 'Add Field'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Delete Field
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Remove <strong>{confirmDelete.label}</strong> (<code className="font-mono text-xs">{confirmDelete.fieldKey}</code>)? Existing responses that captured this field stay intact, but it won't appear on new assessments.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
