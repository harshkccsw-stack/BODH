import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Sigma } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLUMN_GROUPS, type ReportColumn } from './reportRulesApi';
import { buildScoreTree, flatten } from './column-tree';

/**
 * The column picker every formula editor inserts from — Report Setup's Rules
 * step and the AI translation screen.
 *
 * <h3>Why a tree and not a list of labels</h3>
 *
 * A score column's label is its FULL path ("Fundamental Skillset › Cognitive
 * check › Verbal"), because MQT names are deliberately not unique and a bare
 * name would make two columns read identically. That is the right identity and
 * the wrong thing to render in a 260px column: `truncate` cuts the TAIL, and
 * the tail is the only part that differs between siblings. Two rows under the
 * same parent then read as the same row.
 *
 * Worse, an MQT's own score and its subtree total differ only by a trailing
 * "(subtree total)", so they truncate to identical strings AND sit adjacent.
 * Picking the wrong one does not fail — it produces a quietly wrong report,
 * which is the failure this whole area is arranged to prevent.
 *
 * So the ancestors are drawn ONCE, as structure: the MQ is a header, each MQT
 * is indented under its parent, and a row shows only its own name. The subtree
 * total stops being a look-alike row and becomes a Σ button ON the parent row,
 * where it cannot be confused with the own score. Everything comes from
 * `column.score` (see ScoreRef) — nothing here parses a label.
 *
 * The key stays visible on every row because it is the identity; with the path
 * gone there is room for it, and two same-named siblings are still told apart.
 */

/** An extra section rendered above the columns — Setup's "Other rules". */
export interface CatalogSection {
  label: string;
  hint?: string;
  items: Array<{
    /** React key and search text. */
    key: string;
    label: string;
    /** What gets inserted, e.g. `[rule:total-score]`. */
    token: string;
    /** Shown as the right-hand code and in the tooltip. */
    code?: string;
  }>;
}

interface Props {
  columns: ReportColumn[];
  /** Inserts the token at the cursor. Already bracketed. */
  onInsert: (token: string) => void;
  sections?: CatalogSection[];
  className?: string;
  autoFocus?: boolean;
}

const matches = (q: string, ...text: Array<string | null | undefined>) =>
  text.some((t) => (t ?? '').toLowerCase().includes(q));

export function ColumnCatalog({ columns, onInsert, sections = [], className, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (autoFocus) searchRef.current?.focus();
  }, [autoFocus]);

  const scores = useMemo(
    () => buildScoreTree(columns.filter((c) => c.group === 'scores')),
    [columns],
  );

  /** The non-score groups, in the order COLUMN_GROUPS declares them. */
  const flatGroups = useMemo(
    () =>
      COLUMN_GROUPS.filter((g) => g.key !== 'scores')
        .map((g) => ({ ...g, items: columns.filter((c) => c.group === g.key) }))
        .filter((g) => g.items.length > 0),
    [columns],
  );

  const scoresLabel = COLUMN_GROUPS.find((g) => g.key === 'scores')?.label ?? 'MQ / MQT scores';

  // While filtering, the tree is the wrong shape — a match whose parent does
  // not match would lose its context — so matches are listed flat with their
  // full path, which is what the label already is.
  const hits = useMemo(() => {
    if (!q) return [];
    return columns.filter((c) => matches(q, c.label, c.key, c.score?.nodeName, c.score?.mqName));
  }, [columns, q]);

  const sectionHits = useMemo(
    () =>
      sections
        .map((s) => ({ ...s, items: s.items.filter((i) => !q || matches(q, i.label, i.code)) }))
        .filter((s) => s.items.length > 0),
    [sections, q],
  );

  const nothing = q.length > 0 && hits.length === 0 && sectionHits.length === 0;

  return (
    <div className={cn('flex min-h-0 flex-col rounded-md border', className)}>
      <div className="relative shrink-0 border-b p-1.5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          className="w-full rounded bg-transparent py-1 pl-6 pr-2 text-[11px] outline-none placeholder:text-muted-foreground"
          placeholder="Filter columns…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {sectionHits.map((s) => (
          <div key={s.label}>
            <GroupLabel>{s.label}</GroupLabel>
            {s.hint && <p className="mb-1 text-[10px] text-muted-foreground">{s.hint}</p>}
            {s.items.map((i) => (
              <Row
                key={i.key}
                title={i.code ? `${i.label} — ${i.code}` : i.label}
                code={i.code}
                onClick={() => onInsert(i.token)}
              >
                <Sigma className="mr-1 inline h-3 w-3 shrink-0" />
                {i.label}
              </Row>
            ))}
          </div>
        ))}

        {q ? (
          hits.length > 0 && (
            <div>
              <GroupLabel>
                {hits.length} match{hits.length === 1 ? '' : 'es'}
              </GroupLabel>
              {hits.map((c) => (
                <Row
                  key={c.key}
                  title={`${c.label} — ${c.key}`}
                  code={c.key}
                  onClick={() => onInsert(`[${c.key}]`)}
                >
                  {c.label}
                </Row>
              ))}
            </div>
          )
        ) : (
          <>
            {(scores.groups.length > 0 || scores.loose.length > 0) && (
              <div>
                <GroupLabel>{scoresLabel}</GroupLabel>
                {scores.groups.map((g) => (
                  <div key={g.id} className="mb-1.5">
                    <div className="flex items-baseline gap-1 px-1 py-0.5">
                      <span className="truncate text-[11px] font-semibold" title={g.name}>
                        {g.name}
                      </span>
                      {g.total && (
                        <button
                          className="ml-auto shrink-0 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={`${g.total.label} — ${g.total.key}`}
                          onClick={() => onInsert(`[${g.total!.key}]`)}
                        >
                          Σ all
                        </button>
                      )}
                    </div>
                    {flatten(g.roots).map((n) => (
                      <Row
                        key={n.column.key}
                        title={`${n.column.label} — ${n.column.key}`}
                        code={n.column.key}
                        indent={n.depth + 1}
                        onClick={() => onInsert(`[${n.column.key}]`)}
                        // The subtree total used to be a second row reading
                        // identically to this one once truncated. As a button
                        // on the row it cannot be mistaken for the own score.
                        after={
                          n.subtree && (
                            <button
                              className="shrink-0 rounded px-1 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
                              title={`${n.subtree.label} — ${n.subtree.key}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInsert(`[${n.subtree!.key}]`);
                              }}
                            >
                              Σ
                            </button>
                          )
                        }
                      >
                        {n.name}
                      </Row>
                    ))}
                  </div>
                ))}
                {scores.loose.map((c) => (
                  <Row
                    key={c.key}
                    title={`${c.label} — ${c.key}`}
                    code={c.key}
                    onClick={() => onInsert(`[${c.key}]`)}
                  >
                    {c.label}
                  </Row>
                ))}
                {scores.groups.length > 0 && (
                  <p className="px-1 pt-0.5 text-[10px] text-muted-foreground">
                    Σ inserts that branch’s total — the node plus everything under it.
                  </p>
                )}
              </div>
            )}

            {flatGroups.map((g) => (
              <div key={g.key}>
                <GroupLabel>{g.label}</GroupLabel>
                {g.items.map((c) => (
                  <Row
                    key={c.key}
                    title={`${c.label} — ${c.key}`}
                    code={c.key}
                    onClick={() => onInsert(`[${c.key}]`)}
                  >
                    {c.label}
                  </Row>
                ))}
              </div>
            ))}
          </>
        )}

        {nothing && (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 text-[11px] font-medium text-muted-foreground">{children}</div>
  );
}

function Row({
  children, title, code, onClick, indent = 0, after,
}: {
  children: React.ReactNode;
  title: string;
  code?: string;
  onClick: () => void;
  indent?: number;
  after?: React.ReactNode;
}) {
  return (
    <div
      className="group flex items-center gap-1 rounded pr-1 hover:bg-muted"
      style={indent ? { paddingLeft: indent * 10 } : undefined}
    >
      <button
        type="button"
        className="flex-1 truncate rounded px-1.5 py-1 text-left text-[11px]"
        title={title}
        onClick={onClick}
      >
        {children}
      </button>
      {after}
      {code && (
        <code className="hidden shrink-0 font-mono text-[10px] text-muted-foreground group-hover:inline">
          {code}
        </code>
      )}
    </div>
  );
}

/**
 * The same catalog behind an "Insert…" button, for the translation screen —
 * one narrow row per draft formula has no room for a standing panel.
 */
export function ColumnCatalogButton(props: Props & { buttonLabel?: string }) {
  const { buttonLabel = 'Insert…', className, ...rest } = props;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className={cn(
          'flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs',
          className,
        )}
        onClick={() => setOpen((o) => !o)}
        title="Insert a column or another rule at the cursor"
      >
        {buttonLabel}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <ColumnCatalog
          {...rest}
          autoFocus
          className="absolute right-0 z-20 mt-1 max-h-80 w-72 bg-background shadow-lg"
          onInsert={(t) => { rest.onInsert(t); setOpen(false); }}
        />
      )}
    </div>
  );
}
