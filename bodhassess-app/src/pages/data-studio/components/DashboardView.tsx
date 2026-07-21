'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BarChart3, GripVertical, Loader2, Pencil, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { WidgetBody, type MeasureCfg, type WidgetConfig } from '@/src/components/data-studio/DashboardWidgets';
import {
  dataStudioApi,
  type Dashboard, type DatasetColumn, type Sheet, type Widget, type WidgetType, type Workbook,
} from '@/lib/api';

const WIDTHS: { label: string; w: number }[] = [
  { label: '¼', w: 3 }, { label: '½', w: 6 }, { label: '¾', w: 9 }, { label: 'Full', w: 12 },
];

interface Props {
  dashboard: Dashboard;
  workbook: Workbook;
  canEdit: boolean;
  onChanged: () => void;
}

export function DashboardView({ dashboard, workbook, canEdit, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>(dashboard.widgets ?? []);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { setWidgets(dashboard.widgets ?? []); }, [dashboard.id, dashboard.widgets]);

  const sheetsById = useMemo(() => {
    const m = new Map<number, Sheet>();
    for (const s of workbook.sheets) m.set(s.id, s);
    return m;
  }, [workbook.sheets]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = useCallback(async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.findIndex((w) => w.id === active.id);
    const newIdx = widgets.findIndex((w) => w.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(widgets, oldIdx, newIdx);
    setWidgets(next);
    // Persist new ordering.
    await Promise.all(next.map((w, i) => dataStudioApi.updateWidget(w.id, { sortOrder: i })));
  }, [widgets]);

  const setWidth = async (id: number, w: number) => {
    setWidgets((ws) => ws.map((x) => (x.id === id ? { ...x, w } : x)));
    await dataStudioApi.updateWidget(id, { w });
  };

  const remove = async (id: number) => {
    setWidgets((ws) => ws.filter((x) => x.id !== id));
    await dataStudioApi.deleteWidget(id);
  };

  if (workbook.sheets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        Create a sheet first — widgets read from a sheet's data.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{widgets.length} widget{widgets.length === 1 ? '' : 's'}</span>
        {canEdit && (
          <div className="flex items-center gap-2">
            {editing && (
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add widget
              </Button>
            )}
            <Button variant={editing ? 'primary' : 'outline'} size="sm" onClick={() => setEditing((e) => !e)}>
              <Pencil className="h-4 w-4" /> {editing ? 'Done' : 'Edit'}
            </Button>
          </div>
        )}
      </div>

      {widgets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No widgets yet.</p>
          {canEdit && (
            <Button variant="primary" onClick={() => { setEditing(true); setAddOpen(true); }}>
              <Plus className="h-4 w-4" /> Add widget
            </Button>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-12 gap-3">
              {widgets.map((w) => (
                <WidgetCard
                  key={w.id}
                  widget={w}
                  sheet={w.sheetId ? sheetsById.get(w.sheetId) : undefined}
                  editing={editing}
                  onWidth={(width) => setWidth(w.id, width)}
                  onRemove={() => remove(w.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {addOpen && (
        <AddWidgetDialog
          workbook={workbook}
          dashboardId={dashboard.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function WidgetCard({
  widget, sheet, editing, onWidth, onRemove,
}: {
  widget: Widget; sheet?: Sheet; editing: boolean;
  onWidth: (w: number) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const span = widget.w ?? 6;
  const bodyHeight = (widget.h ?? 2) * 140;
  const cfg = widget.config as WidgetConfig;
  const style: React.CSSProperties = {
    gridColumn: `span ${span} / span ${span}`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {editing && (
            <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground" aria-label="Drag">
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span className="truncate text-sm font-medium">{cfg.title || widget.type}</span>
        </div>
        {editing && (
          <div className="flex items-center gap-1">
            {WIDTHS.map((opt) => (
              <button
                key={opt.w}
                onClick={() => onWidth(opt.w)}
                className={`rounded px-1.5 text-xs ${span === opt.w ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                title={`Width ${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
            <button onClick={onRemove} className="ml-1 text-muted-foreground hover:text-red-600" aria-label="Delete widget">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div style={{ height: bodyHeight }} className="p-2">
        <WidgetBody widget={widget} sheet={sheet} />
      </div>
    </div>
  );
}

/* ---------------- add-widget dialog ---------------- */

const AGGS = ['avg', 'sum', 'count', 'min', 'max', 'p50'] as const;

function AddWidgetDialog({
  workbook, dashboardId, onClose, onAdded,
}: { workbook: Workbook; dashboardId: number; onClose: () => void; onAdded: () => void }) {
  const [type, setType] = useState<WidgetType>('KPI');
  const [sheetId, setSheetId] = useState<number>(workbook.sheets[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [columns, setColumns] = useState<DatasetColumn[]>([]);
  const [loadingCols, setLoadingCols] = useState(false);
  const [dimension, setDimension] = useState('');
  const [measureCol, setMeasureCol] = useState('');
  const [agg, setAgg] = useState<typeof AGGS[number]>('avg');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load the chosen sheet's columns to populate dimension/measure pickers.
  useEffect(() => {
    if (!sheetId) return;
    setLoadingCols(true);
    dataStudioApi.getSheetData(sheetId)
      .then((d) => {
        setColumns(d.columns);
        setDimension((cur) => cur || d.columns.find((c) => c.type !== 'number')?.key || d.columns[0]?.key || '');
        setMeasureCol((cur) => cur || d.columns.find((c) => c.type === 'number')?.key || '');
      })
      .catch(() => setColumns([]))
      .finally(() => setLoadingCols(false));
  }, [sheetId]);

  const numericCols = columns.filter((c) => c.type === 'number');
  const labelOf = (key: string) => columns.find((c) => c.key === key)?.label ?? key;

  const buildConfig = (): WidgetConfig => {
    const measure: MeasureCfg | undefined = measureCol
      ? { expr: `[${measureCol}]`, agg, label: `${agg} ${labelOf(measureCol)}` }
      : undefined;
    if (type === 'KPI') return { title, measure };
    if (type === 'CHART') return { title, chartType, dimension, measure };
    return { title, dimensions: dimension ? [dimension] : [], measures: measure ? [measure] : [] };
  };

  const canSave = !!sheetId && !!measureCol && !saving
    && (type !== 'CHART' || !!dimension);

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      await dataStudioApi.addWidget(dashboardId, {
        type, sheetId, config: buildConfig() as Record<string, unknown>,
        w: type === 'KPI' ? 3 : 6, h: type === 'KPI' ? 1 : 2,
      });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add widget');
      setSaving(false);
    }
  };

  const selectCls = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add widget</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as WidgetType)}>
                <option value="KPI">KPI (single number)</option>
                <option value="CHART">Chart</option>
                <option value="TABLE">Table</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Sheet</Label>
              <select className={selectCls} value={sheetId} onChange={(e) => setSheetId(Number(e.target.value))}>
                {workbook.sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
          </div>

          {loadingCols ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading columns…</div>
          ) : (
            <>
              {(type === 'CHART' || type === 'TABLE') && (
                <div className="space-y-1.5">
                  <Label>{type === 'CHART' ? 'Group by (X axis)' : 'Group by'}</Label>
                  <select className={selectCls} value={dimension} onChange={(e) => setDimension(e.target.value)}>
                    {type === 'TABLE' && <option value="">— none —</option>}
                    {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Measure</Label>
                  <select className={selectCls} value={measureCol} onChange={(e) => setMeasureCol(e.target.value)}>
                    <option value="">— pick a number column —</option>
                    {numericCols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Aggregate</Label>
                  <select className={selectCls} value={agg} onChange={(e) => setAgg(e.target.value as typeof AGGS[number])}>
                    {AGGS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              {type === 'CHART' && (
                <div className="space-y-1.5">
                  <Label>Chart type</Label>
                  <select className={selectCls} value={chartType} onChange={(e) => setChartType(e.target.value as 'bar' | 'line' | 'pie')}>
                    <option value="bar">Bar</option>
                    <option value="line">Line</option>
                    <option value="pie">Pie</option>
                  </select>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DashboardView;
