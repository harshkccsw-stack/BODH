import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Gamepad2, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  GAME_CODE_MAX,
  GAME_CODE_PATTERN,
  GAME_NAME_MAX,
  PORTAL_GAME_CODES,
  gamesApi,
  isPlayableCode,
  type GameResponse,
} from './gamesApi';

// The game catalog. A game is CODE in the portal — one file per game — and
// this page names them: the code is the key the portal renders by, so it must
// match a game file there (PORTAL_GAME_CODES). Which question launches which
// game is chosen on the question form; any number of questions may share one.

type StatusFilter = 'all' | 'active' | 'retired';

interface GameForm {
  id: number | null;
  code: string;
  name: string;
  description: string;
  /** A string so the input can be emptied while typing. */
  version: string;
  active: boolean;
  /** Questions launching the game — shown in the modal, never sent. */
  usedByQuestionIds: number[];
}

const EMPTY_FORM: GameForm = {
  id: null,
  code: '',
  name: '',
  description: '',
  version: '1',
  active: true,
  usedByQuestionIds: [],
};

const usedLabel = (n: number) => (n === 0 ? 'not used yet' : `in ${n} question${n === 1 ? '' : 's'}`);

/** Mirrors GameRequest's constraints, so problems show before the round trip. */
function formProblem(form: GameForm): string | null {
  const code = form.code.trim();
  if (!code) return 'Code is required';
  if (code.length > GAME_CODE_MAX) return `Code is at most ${GAME_CODE_MAX} characters`;
  if (!GAME_CODE_PATTERN.test(code)) return 'Code may contain only letters, digits and underscores';
  if (!form.name.trim()) return 'Name is required';
  if (form.name.trim().length > GAME_NAME_MAX) return `Name is at most ${GAME_NAME_MAX} characters`;
  const version = Number(form.version);
  if (!form.version.trim() || !Number.isInteger(version) || version < 1) return 'Version must be a whole number of at least 1';
  return null;
}

export default function GamesPage() {
  const [games, setGames] = useState<GameResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<GameForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<GameResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const res = await gamesApi.getAllGames();
      setGames(res.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load games');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => { refresh(true); }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return games.filter(
      (g) =>
        (status === 'all' || (status === 'active') === g.active) &&
        (!s ||
          g.name.toLowerCase().includes(s) ||
          g.code.toLowerCase().includes(s) ||
          (g.description ?? '').toLowerCase().includes(s)),
    );
  }, [games, search, status]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (g: GameResponse) => {
    setForm({
      id: g.gameId,
      code: g.code,
      name: g.name,
      description: g.description ?? '',
      version: String(g.version),
      active: g.active,
      usedByQuestionIds: g.usedByQuestionIds,
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    const problem = formProblem(form);
    if (problem) { setFormError(problem); return; }
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      active: form.active,
      version: Number(form.version),
    };
    setSaving(true);
    try {
      if (form.id != null) {
        await gamesApi.updateGame(form.id, payload);
      } else {
        await gamesApi.createGame(payload);
      }
      await refresh();
      setModalOpen(false);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError('');
    try {
      await gamesApi.deleteGame(confirmDelete.gameId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to delete');
    }
  };

  const codeTyped = form.code.trim();

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Question Bank</span><span>/</span>
          <span className="text-foreground font-medium">Games</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Gamepad2 className="h-6 w-6 text-primary" />
              Games
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The games a Game question can launch. Each game's code must match a game file
              the portal ships; the question form picks the game, and any number of questions
              may use the same one. Retiring a game hides it from new questions without
              touching the ones already using it.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Game
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Games</p><p className="text-2xl font-semibold mt-1">{games.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-semibold mt-1">{games.filter((g) => g.active).length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Used by Questions</p><p className="text-2xl font-semibold mt-1">{games.filter((g) => g.usedByQuestionIds.length > 0).length}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
          />
        </div>
        <div className="inline-flex rounded-md border border-input p-0.5">
          {(['all', 'active', 'retired'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'h-8 rounded px-3 text-xs font-medium capitalize transition-colors',
                status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading games…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Gamepad2 className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">{games.length === 0 ? 'No games yet' : 'No matches'}</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {games.length === 0
                ? `Add a game for each game file the portal ships (${PORTAL_GAME_CODES.join(', ')}).`
                : 'Try a different search term or filter.'}
            </p>
            {games.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Add your first game
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((g) => (
              <li
                key={g.gameId}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => openEdit(g)}
              >
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium truncate', !g.active && 'text-muted-foreground')}>{g.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="shrink-0">{usedLabel(g.usedByQuestionIds.length)}</span>
                    {g.description && <span className="truncate">{g.description}</span>}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 shrink-0">
                  {!isPlayableCode(g.code) && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                      title="The portal has no game file for this code — respondents would see 'not available'"
                    >
                      <AlertTriangle className="h-3 w-3" /> no game file
                    </span>
                  )}
                  <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 font-mono text-xs">{g.code}</span>
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">v{g.version}</span>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      g.active
                        ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
                        : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    {g.active ? 'Active' : 'Retired'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openEdit(g); }}
                    title="Edit game"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(g); }}
                    title="Delete game"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base">{form.id != null ? 'Edit Game' : 'Add Game'}</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Code *</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  list="portal-game-codes"
                  maxLength={GAME_CODE_MAX}
                  placeholder="e.g., BASELINE"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <datalist id="portal-game-codes">
                  {PORTAL_GAME_CODES.map((c) => <option key={c} value={c} />)}
                </datalist>
                <p className="text-[0.6875rem] text-muted-foreground">
                  Which game file the portal plays. Letters, digits and underscores; stored upper case.
                  The portal currently ships: {PORTAL_GAME_CODES.join(', ')}.
                </p>
                {codeTyped && GAME_CODE_PATTERN.test(codeTyped) && !isPlayableCode(codeTyped) && (
                  <p className="text-[0.6875rem] text-amber-700 dark:text-amber-400 inline-flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    No game file in the portal has this code — questions using it would show "not available"
                    until one ships.
                  </p>
                )}
                {form.id != null && form.usedByQuestionIds.length > 0 && (
                  <p className="text-[0.6875rem] text-muted-foreground">
                    The code locks once any question using this game has responses.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={GAME_NAME_MAX}
                  placeholder="e.g., Attention Baseline"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[0.6875rem] text-muted-foreground">Shown to respondents on the Launch game card.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="For authors — what the game measures and how it plays"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-end gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Version *</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <label className="flex h-9 items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="font-medium">Active</span>
                  <span className="text-xs text-muted-foreground">— offered for new questions</span>
                </label>
              </div>
              <p className="text-[0.6875rem] text-muted-foreground -mt-2">
                Bump the version when the game's rules change in its file; every recorded result carries it.
              </p>
              {form.id != null && (
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  {form.usedByQuestionIds.length === 0
                    ? 'No question uses this game yet.'
                    : `Used by question${form.usedByQuestionIds.length === 1 ? '' : 's'} ${form.usedByQuestionIds.map((id) => `#${id}`).join(', ')}.`}
                </p>
              )}
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {form.id != null ? 'Save' : 'Add Game'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete Game
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
              <p className="text-sm">
                Remove <strong>{confirmDelete.name}</strong> ({confirmDelete.code}) from the catalog?
                A game that questions still use cannot be deleted — retire it instead, or give
                those questions another game first.
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
