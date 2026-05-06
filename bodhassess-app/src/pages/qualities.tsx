import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { qualitiesApi, type MQ, type MQT } from '@/lib/api';

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// Replace the MQT whose id matches `targetId` by applying `fn`. Returns a new
// tree; if `fn` returns null, the node is dropped.
function mapMqtTree(nodes: MQT[], targetId: string, fn: (n: MQT) => MQT | null): MQT[] {
  const out: MQT[] = [];
  for (const n of nodes) {
    if (n.id === targetId) {
      const replaced = fn(n);
      if (replaced) out.push(replaced);
      continue;
    }
    out.push({
      ...n,
      children: n.children ? mapMqtTree(n.children, targetId, fn) : n.children,
    });
  }
  return out;
}

function flattenMqts(nodes: MQT[] = []): MQT[] {
  const out: MQT[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) out.push(...flattenMqts(n.children));
  }
  return out;
}

function subtreeMatches(nodes: MQT[] = [], q: string): boolean {
  return nodes.some((n) => n.name.toLowerCase().includes(q) || subtreeMatches(n.children, q));
}

export default function QualitiesPage() {
  const [mqs, setMqs] = useState<MQ[]>([]);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [mqModalOpen, setMqModalOpen] = useState(false);
  const [mqForm, setMqForm] = useState<{ id: string | null; name: string; description: string }>({
    id: null, name: '', description: '',
  });
  const [mqError, setMqError] = useState('');

  // MQT editor handles three operations: add at root, add as child, rename.
  const [mqtEditor, setMqtEditor] = useState<{
    mqId: string;
    parentMqtId: string | null; // null => add directly under MQ root
    mqtId: string | null;        // non-null => rename
    name: string;
  }>({ mqId: '', parentMqtId: null, mqtId: null, name: '' });
  const [mqtEditorOpen, setMqtEditorOpen] = useState(false);
  const [mqtError, setMqtError] = useState('');

  const [confirmDeleteMq, setConfirmDeleteMq] = useState<MQ | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    setLoadError('');
    try {
      const list = await qualitiesApi.list();
      setMqs(list.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description || '',
        mqts: Array.isArray(m.mqts) ? m.mqts : [],
      })));
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load qualities');
    }
  };
  useEffect(() => { refresh(); }, []);

  const filteredMqs = useMemo(() => {
    if (!search) return mqs;
    const q = search.toLowerCase();
    return mqs.filter(
      (m) => m.name.toLowerCase().includes(q) || subtreeMatches(m.mqts, q),
    );
  }, [mqs, search]);

  const totalMqts = useMemo(
    () => mqs.reduce((a, m) => a + flattenMqts(m.mqts).length, 0),
    [mqs],
  );

  // --- MQ CRUD ---
  const openAddMq = () => {
    setMqForm({ id: null, name: '', description: '' });
    setMqError('');
    setMqModalOpen(true);
  };
  const openEditMq = (mq: MQ) => {
    setMqForm({ id: mq.id, name: mq.name, description: mq.description || '' });
    setMqError('');
    setMqModalOpen(true);
  };
  const submitMq = async () => {
    const name = mqForm.name.trim();
    if (!name) { setMqError('Name is required'); return; }
    const dup = mqs.find((m) => m.name.toLowerCase() === name.toLowerCase() && m.id !== mqForm.id);
    if (dup) { setMqError('An MQ with this name already exists'); return; }
    try {
      if (mqForm.id) {
        const existing = mqs.find((m) => m.id === mqForm.id)!;
        await qualitiesApi.update(mqForm.id, { ...existing, name, description: mqForm.description.trim() });
      } else {
        await qualitiesApi.create({ id: newId('mq'), name, description: mqForm.description.trim(), mqts: [] });
      }
      await refresh();
      setMqModalOpen(false);
    } catch (e: any) {
      setMqError(e?.message || 'Failed to save');
    }
  };
  const deleteMq = async () => {
    if (!confirmDeleteMq) return;
    await qualitiesApi.delete(confirmDeleteMq.id);
    setConfirmDeleteMq(null);
    await refresh();
  };

  // --- MQT CRUD (recursive — persisted as part of the parent MQ document) ---
  const openAddMqtAtRoot = (mqId: string) => {
    setMqtEditor({ mqId, parentMqtId: null, mqtId: null, name: '' });
    setMqtError('');
    setMqtEditorOpen(true);
  };
  const openAddMqtChild = (mqId: string, parentMqtId: string) => {
    setMqtEditor({ mqId, parentMqtId, mqtId: null, name: '' });
    setMqtError('');
    setMqtEditorOpen(true);
    setCollapsed((c) => ({ ...c, [parentMqtId]: false }));
  };
  const openRenameMqt = (mqId: string, mqt: MQT) => {
    setMqtEditor({ mqId, parentMqtId: null, mqtId: mqt.id, name: mqt.name });
    setMqtError('');
    setMqtEditorOpen(true);
  };
  const submitMqt = async () => {
    const name = mqtEditor.name.trim();
    if (!name) { setMqtError('Name is required'); return; }
    const parent = mqs.find((m) => m.id === mqtEditor.mqId);
    if (!parent) return;

    // Sibling-uniqueness check — duplicates only disallowed under the same
    // direct parent, not across the whole tree.
    const findSiblingsContaining = (nodes: MQT[], targetId: string): MQT[] | null => {
      if (nodes.some((n) => n.id === targetId)) return nodes;
      for (const n of nodes) {
        if (n.children) {
          const r = findSiblingsContaining(n.children, targetId);
          if (r) return r;
        }
      }
      return null;
    };
    const findChildrenOf = (nodes: MQT[], targetId: string): MQT[] | null => {
      for (const n of nodes) {
        if (n.id === targetId) return n.children || [];
        if (n.children) {
          const r = findChildrenOf(n.children, targetId);
          if (r) return r;
        }
      }
      return null;
    };
    let siblings: MQT[];
    if (mqtEditor.mqtId) {
      siblings = findSiblingsContaining(parent.mqts, mqtEditor.mqtId) || [];
    } else if (mqtEditor.parentMqtId) {
      siblings = findChildrenOf(parent.mqts, mqtEditor.parentMqtId) || [];
    } else {
      siblings = parent.mqts;
    }
    const dup = siblings.find(
      (t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== mqtEditor.mqtId,
    );
    if (dup) { setMqtError('An MQT with this name already exists at this level'); return; }

    let updatedMqts: MQT[];
    if (mqtEditor.mqtId) {
      updatedMqts = mapMqtTree(parent.mqts, mqtEditor.mqtId, (n) => ({ ...n, name }));
    } else if (mqtEditor.parentMqtId) {
      updatedMqts = mapMqtTree(parent.mqts, mqtEditor.parentMqtId, (n) => ({
        ...n,
        children: [...(n.children || []), { id: newId('mqt'), name }],
      }));
    } else {
      updatedMqts = [...parent.mqts, { id: newId('mqt'), name }];
    }

    try {
      await qualitiesApi.update(parent.id, { ...parent, mqts: updatedMqts });
      await refresh();
      setMqtEditorOpen(false);
    } catch (e: any) {
      setMqtError(e?.message || 'Failed to save');
    }
  };
  const removeMqt = async (mqId: string, mqtId: string) => {
    const parent = mqs.find((m) => m.id === mqId);
    if (!parent) return;
    const remove = (nodes: MQT[]): MQT[] =>
      nodes
        .filter((n) => n.id !== mqtId)
        .map((n) => ({ ...n, children: n.children ? remove(n.children) : n.children }));
    const updatedMqts = remove(parent.mqts);
    await qualitiesApi.update(parent.id, { ...parent, mqts: updatedMqts });
    await refresh();
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Question Bank</span><span>/</span>
          <span className="text-foreground font-medium">Measured Qualities</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              Measured Qualities
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Define the traits and constructs your assessments measure. Each Measured Quality (MQ) is the root of a tree of Measured Quality Types (MQTs). MQTs can nest to any depth; option scoring in Create Questionnaire targets any MQT in the tree (the MQ root itself is never scored).
            </p>
          </div>
          <Button variant="primary" onClick={openAddMq}>
            <Plus className="h-4 w-4" />
            Add MQ
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">MQs Defined</p><p className="text-2xl font-semibold mt-1">{mqs.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total MQTs</p><p className="text-2xl font-semibold mt-1">{totalMqts}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Avg MQTs / MQ</p><p className="text-2xl font-semibold mt-1">{mqs.length ? (totalMqts / mqs.length).toFixed(1) : '0.0'}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search MQs or MQTs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      {filteredMqs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Layers className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {mqs.length === 0 ? 'No Measured Qualities yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {mqs.length === 0
                ? 'Add your first MQ (e.g. "Personality") and start listing the traits you measure.'
                : 'Try a different search term.'}
            </p>
            {mqs.length === 0 && (
              <Button variant="primary" onClick={openAddMq} className="mt-4">
                <Plus className="h-4 w-4" /> Add your first MQ
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredMqs.map((mq) => {
            const total = flattenMqts(mq.mqts).length;
            return (
              <Card key={mq.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{mq.name}</CardTitle>
                      {mq.description && (
                        <p className="text-xs text-muted-foreground mt-1">{mq.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" mode="icon" onClick={() => openEditMq(mq)} title="Rename MQ">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" mode="icon" onClick={() => setConfirmDeleteMq(mq)} title="Delete MQ">
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {total} MQT{total !== 1 ? 's' : ''}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => openAddMqtAtRoot(mq.id)}>
                      <Plus className="h-3 w-3" />
                      Add MQT
                    </Button>
                  </div>

                  {mq.mqts.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No MQTs defined. Add at least one so this MQ is usable in assessments.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {mq.mqts.map((node) => (
                        <MqtNode
                          key={node.id}
                          node={node}
                          depth={0}
                          collapsed={collapsed}
                          onToggleCollapse={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
                          onAddChild={(pid) => openAddMqtChild(mq.id, pid)}
                          onRename={(n) => openRenameMqt(mq.id, n)}
                          onRemove={(id) => removeMqt(mq.id, id)}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* MQ modal */}
      {mqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setMqModalOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{mqForm.id ? 'Rename MQ' : 'Add Measured Quality'}</CardTitle>
              <button onClick={() => setMqModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {mqError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{mqError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input
                  value={mqForm.name}
                  onChange={(e) => setMqForm({ ...mqForm, name: e.target.value })}
                  placeholder="e.g., Personality"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  rows={2}
                  value={mqForm.description}
                  onChange={(e) => setMqForm({ ...mqForm, description: e.target.value })}
                  placeholder="Optional — what does this MQ capture?"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setMqModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submitMq}>{mqForm.id ? 'Save' : 'Add MQ'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MQT modal */}
      {mqtEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setMqtEditorOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">
                {mqtEditor.mqtId
                  ? 'Rename MQT'
                  : mqtEditor.parentMqtId
                    ? 'Add Sub-MQT'
                    : 'Add MQT'}
              </CardTitle>
              <button onClick={() => setMqtEditorOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {mqtError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{mqtError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input
                  value={mqtEditor.name}
                  onChange={(e) => setMqtEditor({ ...mqtEditor, name: e.target.value })}
                  placeholder="e.g., Extraversion"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setMqtEditorOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submitMqt}>{mqtEditor.mqtId ? 'Save' : 'Add'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete MQ confirmation */}
      {confirmDeleteMq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDeleteMq(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete MQ
              </CardTitle>
              <button onClick={() => setConfirmDeleteMq(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Remove <strong>{confirmDeleteMq.name}</strong> and its {flattenMqts(confirmDeleteMq.mqts).length} MQT{flattenMqts(confirmDeleteMq.mqts).length !== 1 ? 's' : ''}?
                Existing assessments that reference these MQT IDs will keep their scores but the labels will disappear.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDeleteMq(null)}>Cancel</Button>
                <Button variant="primary" onClick={deleteMq} className="bg-red-600 hover:bg-red-700 text-white">
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

interface MqtNodeProps {
  node: MQT;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (n: MQT) => void;
  onRemove: (id: string) => void;
}

function MqtNode({
  node, depth, collapsed, onToggleCollapse, onAddChild, onRename, onRemove,
}: MqtNodeProps) {
  const hasChildren = !!node.children?.length;
  const isCollapsed = !!collapsed[node.id];
  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded-md py-1 pl-1 pr-1 hover:bg-muted/50"
        style={{ marginLeft: `${depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleCollapse(node.id)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-3.5 shrink-0" />
        )}
        <span
          className={cn(
            'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
            depth === 0
              ? 'border-primary/30 bg-primary/5'
              : 'border-border bg-muted/40',
          )}
        >
          {node.name}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onAddChild(node.id)}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary hover:bg-primary/10 shrink-0"
          title="Add a nested MQT under this one"
        >
          <Plus className="h-3 w-3" /> Sub-MQT
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={() => onRename(node)}
            className="text-muted-foreground hover:text-foreground p-0.5"
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(node.id)}
            className="text-muted-foreground hover:text-red-500 p-0.5"
            title="Remove (and all descendants)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {hasChildren && !isCollapsed && (
        <div className="border-l border-border/60 ml-3">
          {node.children!.map((child) => (
            <MqtNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              onAddChild={onAddChild}
              onRename={onRename}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
