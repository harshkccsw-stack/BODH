import type { MqtChoice } from './question-form-modal';
import type { MqtKeyResolver } from './question-sheet-rules';
import type { NewQuality, NewQualityType, PathProposal } from './questionImportApi';

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
