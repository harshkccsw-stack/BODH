import { describe, expect, it } from 'vitest';
import {
  buildImportPlan,
  defaultDecision,
  groupPathsByRoot,
  groupSheetSections,
  renameKeys,
  sectionIdsForRows,
  needsAttention,
  pathResolver,
  reanchoredKey,
  rewriteScoreCells,
  SEP,
  type PathDecision,
} from '../ai-import-plan';
import type { PathProposal, PathSegment } from '../questionImportApi';
import type { MqtChoice } from '../question-form-modal';

const seg = (name: string, status: PathSegment['status'], ids: Partial<PathSegment> = {}): PathSegment => ({
  name, status, mqId: null, mqtId: null, parentMqId: null, parentMqtId: null, note: null,
  suggestedMqtId: null, suggestedPath: null, ...ids,
});
const path = (segments: PathSegment[], extra: Partial<PathProposal> = {}): PathProposal => ({
  pathKey: segments.map((s) => s.name).join(SEP),
  questionCount: 1,
  fullyResolved: segments.every((s) => s.status === 'MATCHED' || s.status === 'MATCHED_NORMALISED'),
  needsPick: segments.some((s) => s.status === 'AMBIGUOUS'),
  segments,
  ...extra,
});

describe('defaultDecision', () => {
  it('uses an existing type when the whole path resolved', () => {
    const p = path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('Grit', 'MATCHED', { mqtId: 41 })]);
    expect(defaultDecision(p)).toEqual({ mode: 'existing', mqtId: 41 });
  });

  it('creates when anything is missing, and resolves ambiguity to NOTHING', () => {
    expect(defaultDecision(path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('New', 'CREATE')])).mode).toBe('create');
    expect(defaultDecision(path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('Grit', 'AMBIGUOUS')])).mode).toBe('unmapped');
  });

  it('cannot score against a bare quality, so a one-segment path is unmapped', () => {
    expect(defaultDecision(path([seg('Drive', 'MATCHED', { mqId: 7 })])).mode).toBe('unmapped');
  });
});

describe('buildImportPlan', () => {
  it('creates only the missing tail, anchored to the quality that matched', () => {
    const p = path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('Grit', 'CREATE', { parentMqId: 7 })]);
    const plan = buildImportPlan([p], { [p.pathKey]: { mode: 'create' } });

    expect(plan.newQualities).toEqual([]);
    expect(plan.newQualityTypes).toEqual([{
      ref: -1, name: 'Grit', qualityRef: null, qualityId: 7, parentTypeRef: null, parentTypeId: null,
    }]);
    expect(plan.keyToId.get(p.pathKey)).toBe(-1);
  });

  it('creates a shared missing quality ONCE for two paths under it', () => {
    // Validity › Infrequency and Validity › Social Desirability both need a
    // Validity — the same one. Two would leave the resolver unable to pick
    // either next time.
    const a = path([seg('Validity', 'CREATE'), seg('Infrequency', 'CREATE')]);
    const b = path([seg('Validity', 'CREATE'), seg('Social Desirability', 'CREATE')]);
    const plan = buildImportPlan([a, b], { [a.pathKey]: { mode: 'create' }, [b.pathKey]: { mode: 'create' } });

    expect(plan.newQualities).toHaveLength(1);
    expect(plan.newQualityTypes).toHaveLength(2);
    expect(plan.newQualityTypes.map((t) => t.qualityRef)).toEqual([-1, -1]);
    expect(new Set(plan.newQualityTypes.map((t) => t.ref)).size).toBe(2);
  });

  it('chains a three-level path type-to-type, not everything to the quality', () => {
    const p = path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('Mid', 'CREATE'), seg('Leaf', 'CREATE')]);
    const plan = buildImportPlan([p], { [p.pathKey]: { mode: 'create' } });

    const [mid, leaf] = plan.newQualityTypes;
    expect(mid).toMatchObject({ name: 'Mid', qualityId: 7, parentTypeRef: null });
    expect(leaf).toMatchObject({ name: 'Leaf', qualityId: null, parentTypeRef: mid.ref });
    expect(plan.keyToId.get(p.pathKey)).toBe(leaf.ref);
  });

  it('honours "use existing" and "leave unmapped" without creating anything', () => {
    const p = path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('Grit', 'CREATE')]);
    const existing: Record<string, PathDecision> = { [p.pathKey]: { mode: 'existing', mqtId: 99 } };
    const unmapped: Record<string, PathDecision> = { [p.pathKey]: { mode: 'unmapped' } };

    expect(buildImportPlan([p], existing).keyToId.get(p.pathKey)).toBe(99);
    expect(buildImportPlan([p], existing).newQualityTypes).toEqual([]);
    expect(buildImportPlan([p], unmapped).keyToId.get(p.pathKey)).toBeNull();
  });
});

describe('needsAttention', () => {
  it('blocks approve until an ambiguous or unpicked path is decided', () => {
    const p = path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('Grit', 'AMBIGUOUS')]);
    expect(needsAttention(p, { mode: 'existing' })).toBe(true);
    expect(needsAttention(p, { mode: 'existing', mqtId: 41 })).toBe(false);
    expect(needsAttention(p, { mode: 'unmapped' })).toBe(false);
    expect(needsAttention(p, { mode: 'create' })).toBe(true);
  });
});

describe('pathResolver', () => {
  const choices: MqtChoice[] = [{ id: 41, name: 'Grit', label: `Drive${SEP}Grit` }];

  it('drops an unmapped score silently and errors on an unknown one', () => {
    const p = path([seg('Drive', 'MATCHED', { mqId: 7 }), seg('Grit', 'CREATE')]);
    const plan = buildImportPlan([p], { [p.pathKey]: { mode: 'unmapped' } });
    const errors: string[] = [];
    const resolve = pathResolver(plan, choices);

    expect(resolve(p.pathKey, 'here', errors)).toBeNull();
    expect(errors).toEqual([]);
    expect(resolve(`Nope${SEP}Never`, 'here', errors)).toBeNull();
    expect(errors[0]).toContain('was not resolved');
  });
});

describe('re-anchoring', () => {
  it('builds the new key from the found node then the rest of the sheet path', () => {
    const p = path([
      seg('Self-Efficacy', 'CREATE', { suggestedMqtId: 41, suggestedPath: `Internal Drive${SEP}Self-Efficacy` }),
      seg('Task Confidence', 'CREATE'),
    ]);
    expect(reanchoredKey(p, `Internal Drive${SEP}Self-Efficacy`))
      .toBe(`Internal Drive${SEP}Self-Efficacy${SEP}Task Confidence`);
  });

  it('rewrites every score cell that carried the old key and nothing else', () => {
    const old = `Self-Efficacy${SEP}Task Confidence`;
    const neu = `Internal Drive${SEP}Self-Efficacy${SEP}Task Confidence`;
    const row = {
      stem: `${old} is not a path in here`,
      scores: `${old}:2 | Other${SEP}Thing:1`,
      option1Scores: `${old}:5`,
      option2Scores: `Other${SEP}Thing:3`,
    };
    const out = rewriteScoreCells(row, old, neu);

    expect(out.stem).toBe(row.stem);
    expect(out.scores).toBe(`${neu}:2 | Other${SEP}Thing:1`);
    expect(out.option1Scores).toBe(`${neu}:5`);
    expect(out.option2Scores).toBe(`Other${SEP}Thing:3`);
  });
});

describe('groupSheetSections', () => {
  it('lists each distinct name once, in first-seen order, with its row count', () => {
    const groups = groupSheetSections(['Part 2', 'Part 1', 'Part 2', 'Part 1', 'Part 2']);
    expect(groups.map((g) => g.value)).toEqual(['Part 2', 'Part 1']);
    expect(groups.map((g) => g.count)).toEqual([3, 2]);
  });

  it('folds case and surrounding space together, keeping the first spelling', () => {
    const groups = groupSheetSections(['Part A', ' part a ', 'PART A']);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ value: 'Part A', key: 'part a', count: 3 });
  });

  it('ignores blank and missing cells rather than inventing a section for them', () => {
    expect(groupSheetSections([null, '', '   '])).toEqual([]);
    expect(groupSheetSections(['Part A', null, ''])).toEqual([
      { value: 'Part A', key: 'part a', count: 1 },
    ]);
  });
});

describe('sectionIdsForRows', () => {
  const ids = new Map([['part a', 7], ['part b', 9]]);

  it('places each row by its name, however it was typed', () => {
    expect(sectionIdsForRows(['Part A', ' PART B ', 'Part A'], ids)).toEqual([7, 9, 7]);
  });

  it('leaves a row unplaced when the sheet named nothing or the name was not mapped', () => {
    expect(sectionIdsForRows(['', null, 'Part C'], ids)).toEqual([null, null, null]);
  });
});

describe('groupPathsByRoot', () => {
  const p = (names: string[], count: number) =>
    path(names.map((n) => seg(n, 'CREATE')), { questionCount: count });

  it('gathers every path of one root into a single block, in first-seen order', () => {
    const groups = groupPathsByRoot([
      p(['Adaptability', 'Self-Efficacy'], 2),
      p(['Tenacity', 'Perseverance'], 1),
      p(['Adaptability', 'Growth Mindset'], 3),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['Adaptability', 'Tenacity']);
    expect(groups[0].paths).toHaveLength(2);
    expect(groups[0].questionCount).toBe(5);
    expect(groups[1].questionCount).toBe(1);
  });

  it('keeps a root that names no type as a block of its own', () => {
    const groups = groupPathsByRoot([p(['Adaptability'], 4)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].paths[0].pathKey).toBe('Adaptability');
  });
});

describe('renameKeys', () => {
  const paths = [
    path([seg('Adaptability (v2)', 'CREATE'), seg('Self-Efficacy', 'CREATE')]),
    path([seg('Adaptability (v2)', 'CREATE'), seg('Growth Mindset', 'CREATE')]),
    path([seg('Tenacity', 'CREATE'), seg('Self-Efficacy', 'CREATE')]),
  ];

  it('rewrites every path under a renamed root, and nothing else', () => {
    expect(renameKeys(paths, `Adaptability (v2)${SEP}Self-Efficacy`, 0, 'Adaptability')).toEqual([
      { from: `Adaptability (v2)${SEP}Self-Efficacy`, to: `Adaptability${SEP}Self-Efficacy` },
      { from: `Adaptability (v2)${SEP}Growth Mindset`, to: `Adaptability${SEP}Growth Mindset` },
    ]);
  });

  it('rewrites only the path that passes through a renamed type', () => {
    expect(renameKeys(paths, `Adaptability (v2)${SEP}Self-Efficacy`, 1, 'Self Efficacy')).toEqual([
      { from: `Adaptability (v2)${SEP}Self-Efficacy`, to: `Adaptability (v2)${SEP}Self Efficacy` },
    ]);
  });

  it('can land two paths on one key — the caller merges them', () => {
    expect(renameKeys(paths, `Adaptability (v2)${SEP}Self-Efficacy`, 0, 'Tenacity')).toEqual([
      { from: `Adaptability (v2)${SEP}Self-Efficacy`, to: `Tenacity${SEP}Self-Efficacy` },
      { from: `Adaptability (v2)${SEP}Growth Mindset`, to: `Tenacity${SEP}Growth Mindset` },
    ]);
  });

  it('does nothing for a blank, unchanged or out-of-range name', () => {
    expect(renameKeys(paths, `Tenacity${SEP}Self-Efficacy`, 0, '   ')).toEqual([]);
    expect(renameKeys(paths, `Tenacity${SEP}Self-Efficacy`, 0, 'Tenacity')).toEqual([]);
    expect(renameKeys(paths, `Tenacity${SEP}Self-Efficacy`, 5, 'Whatever')).toEqual([]);
  });
});
