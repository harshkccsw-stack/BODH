import { describe, expect, it } from 'vitest';
import { buildScoreTree, flatten } from '../column-tree';
import type { ReportColumn } from '../reportRulesApi';

/**
 * The picker's tree, against the exact shape
 * `/api/report-rules/columns/getByAssessment/{id}` returns — see
 * ReportColumnCatalogTest on the backend, which pins the other end of it.
 */

const col = (
  key: string,
  label: string,
  score: ReportColumn['score'] = null,
): ReportColumn => ({ key, label, type: 'number', group: 'scores', score });

const own = (depth: number, nodeName: string, parentKey: string | null) =>
  ({ role: 'own', depth, nodeName, mqId: 1, mqName: 'Fundamental Skillset', parentKey });

/** One MQ, a parent with two children, and the parent's subtree total. */
const sample: ReportColumn[] = [
  col('mqt:1', 'Fundamental Skillset › Cognitive check', own(0, 'Cognitive check', null)),
  col('mqtt:1', 'Fundamental Skillset › Cognitive check (subtree total)', {
    role: 'subtree', depth: 0, nodeName: 'Cognitive check',
    mqId: 1, mqName: 'Fundamental Skillset', parentKey: null,
  }),
  col('mqt:2', 'Fundamental Skillset › Cognitive check › Verbal', own(1, 'Verbal', 'mqt:1')),
  col('mqt:3', 'Fundamental Skillset › Cognitive check › Numeric', own(1, 'Numeric', 'mqt:1')),
  col('mq:1', 'Fundamental Skillset (MQ total)', {
    role: 'mqTotal', depth: 0, nodeName: 'Fundamental Skillset',
    mqId: 1, mqName: 'Fundamental Skillset', parentKey: null,
  }),
];

describe('buildScoreTree', () => {
  it('nests children under their parent and keeps the MQ as the root', () => {
    const { groups, loose } = buildScoreTree(sample);
    expect(loose).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Fundamental Skillset');
    expect(groups[0].total?.key).toBe('mq:1');
    expect(groups[0].roots).toHaveLength(1);
    expect(groups[0].roots[0].children.map((c) => c.name)).toEqual(['Verbal', 'Numeric']);
  });

  it('hangs a subtree total on its own node instead of listing it as a row', () => {
    const { groups } = buildScoreTree(sample);
    const rows = flatten(groups[0].roots);
    // Three rows for three MQTs — the subtree total is NOT a fourth row that
    // reads identically to the first once truncated.
    expect(rows.map((r) => r.column.key)).toEqual(['mqt:1', 'mqt:2', 'mqt:3']);
    expect(rows[0].subtree?.key).toBe('mqtt:1');
    expect(rows[1].subtree).toBeNull();
  });

  it('shows a name, not a path — the path stays on the column for the tooltip', () => {
    const rows = flatten(buildScoreTree(sample).groups[0].roots);
    expect(rows.map((r) => r.name)).toEqual(['Cognitive check', 'Verbal', 'Numeric']);
    expect(rows[1].column.label).toBe('Fundamental Skillset › Cognitive check › Verbal');
  });

  it('keeps a column with no score ref rather than dropping it', () => {
    const odd = col('calc:7', 'Something computed');
    const { groups, loose } = buildScoreTree([...sample, odd]);
    expect(loose).toEqual([odd]);
    expect(flatten(groups[0].roots)).toHaveLength(3);
  });

  it('separates two MQs that share an MQT name', () => {
    const other: ReportColumn[] = [
      col('mqt:9', 'Adaptive Execution › Cognitive check', {
        role: 'own', depth: 0, nodeName: 'Cognitive check',
        mqId: 2, mqName: 'Adaptive Execution', parentKey: null,
      }),
    ];
    const { groups } = buildScoreTree([...sample, ...other]);
    expect(groups.map((g) => g.name)).toEqual(['Fundamental Skillset', 'Adaptive Execution']);
    expect(groups[1].roots[0].column.key).toBe('mqt:9');
  });
});
