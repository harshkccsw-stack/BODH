import type { ReportColumn } from './reportRulesApi';

/**
 * The MQ → MQT tree the column picker draws, built from the `score` field the
 * backend puts on every score column (see ScoreRef). Pure, and separate from
 * the component, because this is the part that must be right: a dropped column
 * is a formula somebody then writes from memory.
 */

/** An MQT node plus the subtree-total column that belongs to it, if any. */
export interface ScoreNode {
  column: ReportColumn;
  depth: number;
  name: string;
  subtree: ReportColumn | null;
  children: ScoreNode[];
}

export interface MqGroup {
  id: string;
  name: string;
  total: ReportColumn | null;
  roots: ScoreNode[];
}

/** The id half of a column key — `mqt:14` and `mqtt:14` share it. */
const idOf = (key: string) => key.slice(key.indexOf(':') + 1);

/**
 * Group the score columns into MQ → MQT tree. Anything without a `score`
 * (an older backend, a column family added later) is returned in `loose` and
 * rendered flat rather than dropped — a column missing from the picker is a
 * formula somebody writes from memory.
 */
export function buildScoreTree(columns: ReportColumn[]): { groups: MqGroup[]; loose: ReportColumn[] } {
  const loose: ReportColumn[] = [];
  const groups: MqGroup[] = [];
  const groupById = new Map<string, MqGroup>();
  const nodeByKey = new Map<string, ScoreNode>();
  const subtreeById = new Map<string, ReportColumn>();

  const groupFor = (c: ReportColumn): MqGroup => {
    const id = c.score?.mqId != null ? String(c.score.mqId) : (c.score?.mqName ?? '—');
    let g = groupById.get(id);
    if (!g) {
      g = { id, name: c.score?.mqName ?? 'Unnamed quality', total: null, roots: [] };
      groupById.set(id, g);
      groups.push(g);
    }
    return g;
  };

  // Pass 1: the subtree totals, so an own row can claim its own.
  for (const c of columns) {
    if (c.score?.role === 'subtree') subtreeById.set(idOf(c.key), c);
  }

  // Pass 2: nodes, in backend order — which is already depth-first per MQ, so
  // a parent is always seen before its children.
  for (const c of columns) {
    const s = c.score;
    if (!s) {
      loose.push(c);
      continue;
    }
    if (s.role === 'subtree') continue; // attached to its own row below
    if (s.role === 'mqTotal') {
      groupFor(c).total = c;
      continue;
    }
    const node: ScoreNode = {
      column: c,
      depth: s.depth,
      name: s.nodeName || c.label,
      subtree: subtreeById.get(idOf(c.key)) ?? null,
      children: [],
    };
    nodeByKey.set(c.key, node);
    const parent = s.parentKey ? nodeByKey.get(s.parentKey) : null;
    if (parent) parent.children.push(node);
    else groupFor(c).roots.push(node);
  }

  return { groups, loose };
}

/** Flattens a tree back to rows, parents before children. */
export function flatten(nodes: ScoreNode[], out: ScoreNode[] = []): ScoreNode[] {
  for (const n of nodes) {
    out.push(n);
    flatten(n.children, out);
  }
  return out;
}

