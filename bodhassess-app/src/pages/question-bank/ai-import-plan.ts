import type { MqtChoice } from './question-form-modal';
import type { MqtKeyResolver } from './question-sheet-rules';
import type {
  NewQuality,
  NewQualityType,
  PathProposal,
  SheetMappingResponse,
} from './questionImportApi';

// ── From the reviewer's decisions to an import payload, with NO runtime
// imports ───────────────────────────────────────────────────────────────────
// Pure, and kept apart from the panel for the same reason as
// question-sheet-rules.ts: so it can be tested without rendering anything.
// `import type` only, above — see that file.

export const SEP = ' › ';

/** What the reviewer decided about one taxonomy path. */
export interface PathDecision {
  mode: 'create' | 'existing' | 'unmapped';
  /** The MQT to use when mode is 'existing'. */
  mqtId?: number;
}

export function defaultDecision(path: PathProposal): PathDecision {
  // A path naming only a quality has no type to score against — there is
  // nothing to create, because the sheet never said what it would be called.
  if (path.segments.length < 2) return { mode: 'unmapped' };
  // Ambiguity resolves to NOTHING, deliberately: an unresolved path is one
  // click to fix, a confidently wrong one mis-scores the instrument for life.
  if (path.needsPick) return { mode: 'unmapped' };
  if (path.fullyResolved) {
    const last = path.segments[path.segments.length - 1];
    return { mode: 'existing', mqtId: last.mqtId ?? undefined };
  }
  return { mode: 'create' };
}

/** A path still waiting on a person — approve stays disabled while any is. */
export function needsAttention(path: PathProposal, decision: PathDecision): boolean {
  if (decision.mode === 'existing') return decision.mqtId == null;
  if (decision.mode === 'create') return path.segments.some((s) => s.status === 'AMBIGUOUS');
  return false;
}

export interface ImportPlan {
  newQualities: NewQuality[];
  newQualityTypes: NewQualityType[];
  /** Path → the MQT id to score against. Null means deliberately unmapped. */
  keyToId: Map<string, number | null>;
  /** Pending nodes, so the preview can name them before they exist. */
  pendingNames: Map<number, string>;
}

/**
 * The decisions → what to create, and what each path resolves to.
 *
 * <p>Creation is deduplicated by PREFIX, not by path: `Validity › Infrequency`
 * and `Validity › Social Desirability` both need a `Validity`, and they need
 * the SAME one. Keying on the prefix is what stops an import inventing two
 * qualities of one name and then being unable to resolve either next time.
 */
export function buildImportPlan(
  paths: PathProposal[],
  decisions: Record<string, PathDecision>,
): ImportPlan {
  const newQualities: NewQuality[] = [];
  const newQualityTypes: NewQualityType[] = [];
  const keyToId = new Map<string, number | null>();
  const pendingNames = new Map<number, string>();
  const refByPrefix = new Map<string, number>();
  let nextRef = -1;

  for (const path of paths) {
    const decision = decisions[path.pathKey] ?? defaultDecision(path);
    if (decision.mode === 'unmapped') {
      keyToId.set(path.pathKey, null);
      continue;
    }
    if (decision.mode === 'existing') {
      keyToId.set(path.pathKey, decision.mqtId ?? null);
      continue;
    }

    let prefix = '';
    let parentMqId: number | null = null;
    let parentMqRef: number | null = null;
    let parentTypeId: number | null = null;
    let parentTypeRef: number | null = null;
    let finalId: number | null = null;

    path.segments.forEach((segment, i) => {
      prefix = i === 0 ? segment.name : `${prefix}${SEP}${segment.name}`;

      if (segment.status === 'MATCHED' || segment.status === 'MATCHED_NORMALISED') {
        if (i === 0) {
          parentMqId = segment.mqId;
          parentMqRef = null;
        } else {
          parentTypeId = segment.mqtId;
          parentTypeRef = null;
          finalId = segment.mqtId;
        }
        return;
      }

      let ref = refByPrefix.get(prefix);
      if (ref == null) {
        ref = nextRef--;
        refByPrefix.set(prefix, ref);
        pendingNames.set(ref, prefix);
        if (i === 0) {
          newQualities.push({ ref, name: segment.name, description: null });
        } else {
          newQualityTypes.push({
            ref,
            name: segment.name,
            // Exactly one anchor. The first type hangs off the quality; every
            // deeper one off the type above it, which is the chain a partial
            // path two levels down produces.
            qualityRef: i === 1 ? parentMqRef : null,
            qualityId: i === 1 ? parentMqId : null,
            parentTypeRef: i > 1 ? parentTypeRef : null,
            parentTypeId: i > 1 ? parentTypeId : null,
          });
        }
      }
      if (i === 0) {
        parentMqRef = ref;
        parentMqId = null;
      } else {
        parentTypeRef = ref;
        parentTypeId = null;
        finalId = ref;
      }
    });

    keyToId.set(path.pathKey, finalId);
  }

  return { newQualities, newQualityTypes, keyToId, pendingNames };
}

/**
 * The score-cell resolver for generated rows, whose keys are taxonomy PATHS
 * rather than MQT names. Returning null with no error is the "leave unmapped"
 * decision — the score is dropped and the question imports without it, which
 * is legal and deliberately offered.
 */
export function pathResolver(plan: ImportPlan, choices: MqtChoice[]): MqtKeyResolver {
  return (key, where, errors) => {
    if (/^\d+$/.test(key)) {
      const id = Number(key);
      return choices.some((c) => c.id === id) ? id : (errors.push(`${where}: no MQT with id ${id}`), null);
    }
    if (!plan.keyToId.has(key)) {
      errors.push(`${where}: "${key}" was not resolved to a measured quality`);
      return null;
    }
    return plan.keyToId.get(key) ?? null;
  };
}


/**
 * Every score cell that names `oldKey` now names `newKey`. Used when a path is
 * re-anchored: the rows were written with the sheet's own (too shallow) path,
 * and the resolver keys on exactly that string.
 */
export function rewriteScoreCells(
  row: Record<string, string>,
  oldKey: string,
  newKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k !== 'scores' && !/^option\d+Scores$/.test(k)) {
      out[k] = v;
      continue;
    }
    out[k] = v
      .split('|')
      .map((part) => {
        const t = part.trim();
        return t.startsWith(`${oldKey}:`) ? `${newKey}:${t.slice(oldKey.length + 1)}` : t;
      })
      .filter(Boolean)
      .join(' | ');
  }
  return out;
}

/** The re-anchored key: the found node's full path, then the rest of the sheet's path. */
export function reanchoredKey(path: PathProposal, suggestedPath: string): string {
  return [suggestedPath, ...path.segments.slice(1).map((s) => s.name)].join(SEP);
}

/* ===================== the sheet's own sections ===================== */

/**
 * One distinct section name the mapped sheet used, with how many of its rows
 * carried it. `key` is the comparison form — trimmed and lowercased, matching
 * how the template upload's section matcher compares names, so the AI route
 * and the template route cannot disagree about what counts as the same
 * section. Blank cells are not a group: the sheet said nothing about those
 * rows, and inventing a section for them would be a guess.
 */
export interface SheetSectionGroup {
  value: string;
  key: string;
  count: number;
}

/** The distinct section names of a mapped sheet, in the order they first appear. */
export function groupSheetSections(cells: (string | null)[]): SheetSectionGroup[] {
  const out: SheetSectionGroup[] = [];
  const at = new Map<string, number>();
  for (const cell of cells) {
    const value = (cell || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const seen = at.get(key);
    if (seen == null) {
      at.set(key, out.length);
      out.push({ value, key, count: 1 });
    } else {
      out[seen].count += 1;
    }
  }
  return out;
}

/**
 * Per-row section ids, once the author has said where each of the sheet's
 * names goes. A row whose name was left unassigned — or that never carried
 * one — comes back null and is placed by hand afterwards.
 */
export function sectionIdsForRows(
  cells: (string | null)[],
  idByKey: Map<string, number>,
): (number | null)[] {
  return cells.map((cell) => idByKey.get((cell || '').trim().toLowerCase()) ?? null);
}

/* ===================== grouping and renaming paths ===================== */

/**
 * The proposed paths of ONE root quality, so the qualities step can show a
 * measured quality once with its types beneath it instead of reprinting the
 * root on every row. Grouped by the root's name — a sheet that named the same
 * root twice meant the same quality both times, which is exactly what the
 * resolver will do with it.
 */
export interface PathGroup {
  /** The root segment's name; also the group's react key. */
  key: string;
  paths: PathProposal[];
  questionCount: number;
}

export function groupPathsByRoot(paths: PathProposal[]): PathGroup[] {
  const out: PathGroup[] = [];
  const at = new Map<string, number>();
  for (const path of paths) {
    const key = path.segments[0]?.name ?? path.pathKey;
    const seen = at.get(key);
    if (seen == null) {
      at.set(key, out.length);
      out.push({ key, paths: [path], questionCount: path.questionCount });
    } else {
      out[seen].paths.push(path);
      out[seen].questionCount += path.questionCount;
    }
  }
  return out;
}

/**
 * The key rewrites a rename implies: every path that carries the segment
 * being renamed, in the same position and under the same ancestors, gets its
 * own key rewritten. Renaming a root therefore moves the whole group in one
 * go, and renaming a type moves only the paths that actually pass through it.
 *
 * Returns nothing for a blank or unchanged name. Two paths can be rewritten
 * onto the SAME key (renaming "Drive (v2)" to "Drive" when a "Drive" already
 * exists) — the caller merges them; that is the author saying they were one
 * quality all along.
 */
export function renameKeys(
  paths: PathProposal[],
  anchorKey: string,
  segmentIndex: number,
  newName: string,
): { from: string; to: string }[] {
  const name = newName.trim();
  const anchor = anchorKey.split(SEP);
  if (!name || segmentIndex < 0 || segmentIndex >= anchor.length) return [];
  if (anchor[segmentIndex] === name) return [];
  const prefix = anchor.slice(0, segmentIndex + 1);
  const out: { from: string; to: string }[] = [];
  for (const path of paths) {
    const parts = path.pathKey.split(SEP);
    if (parts.length <= segmentIndex) continue;
    if (prefix.some((p, i) => parts[i] !== p)) continue;
    const next = [...parts];
    next[segmentIndex] = name;
    out.push({ from: path.pathKey, to: next.join(SEP) });
  }
  return out;
}

/* ===================== what a re-read changed ===================== */

/**
 * The handful of facts that say how a sheet was read, in the order a person
 * checks them. Derived from the response rather than asked of the model, for
 * the same reason the summary paragraph is: a model describing its own answer
 * describes what it meant to do.
 */
export type ReadingFacts = Record<string, string>;

export interface FactChange {
  label: string;
  from: string;
  to: string;
}

export function readingFacts(res: SheetMappingResponse): ReadingFacts {
  const spec = (res.spec ?? {}) as {
    columns?: { stem?: string | null; path?: string[] | null; section?: string | null };
    options?: { mode?: string | null; columns?: unknown[] | null };
    scoring?: { mode?: string | null };
  };
  const mode = spec.options?.mode ?? null;
  const optionColumns = spec.options?.columns?.length ?? 0;
  return {
    Sheet: res.sheet || '—',
    Questions: String(res.rows?.length ?? 0),
    'Question text': spec.columns?.stem || '—',
    Options: mode
      ? mode === 'COLUMNS' ? `${mode} (${optionColumns})` : mode
      : '—',
    Quality: spec.columns?.path?.length ? spec.columns.path.join(SEP) : '—',
    Section: spec.columns?.section || '—',
    Scoring: spec.scoring?.mode || '—',
    'Rows left out': String(res.skipped?.length ?? 0),
    Problems: String(res.blockers?.length ?? 0),
  };
}

/** Every fact that reads differently after a correction. Empty means it came back the same. */
export function diffFacts(before: ReadingFacts, after: ReadingFacts): FactChange[] {
  const labels = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return labels
    .filter((label) => (before[label] ?? '—') !== (after[label] ?? '—'))
    .map((label) => ({ label, from: before[label] ?? '—', to: after[label] ?? '—' }));
}

/**
 * Section instructions the sheet carried, by section NAME (lowercased, the
 * key `groupSheetSections` produces).
 *
 * <p>The spec's dictionary is keyed by the sheet's own section ID, because
 * that is what the question rows hold; by the time a section is being created
 * the rows carry names, so it is re-keyed by name here. A section created
 * from a workbook that stated its preamble should arrive with it.
 */
export function sectionInstructions(spec: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const dictionary = (spec as { sections?: Record<string, { name?: string; instruction?: string }> })?.sections;
  if (!dictionary) return out;
  for (const entry of Object.values(dictionary)) {
    const name = (entry?.name ?? '').trim().toLowerCase();
    const instruction = (entry?.instruction ?? '').trim();
    if (name && instruction && !out.has(name)) out.set(name, instruction);
  }
  return out;
}
