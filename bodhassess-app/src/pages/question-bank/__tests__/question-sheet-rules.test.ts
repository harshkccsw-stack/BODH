import { describe, expect, it } from 'vitest';
import {
  collectingResolver,
  looksLikeOurTemplate,
  mqtKeyResolver,
  parseQuestionRows,
  planAwareResolver,
  unresolvedCounts,
} from '../question-sheet-rules';
import type { MqtChoice } from '../question-form-modal';

// The choices as the app builds them from the real taxonomy: `label` is the
// full tree path, `name` the bare node name. Two "Self-Efficacy"s on purpose —
// that ambiguity is the whole reason the path form exists.
const SEP = ' › ';
const choices: MqtChoice[] = [
  { id: 41, name: 'Self-Efficacy', label: `Internal Drive${SEP}Self-Efficacy` },
  { id: 42, name: 'Growth Mindset', label: `Internal Drive${SEP}Growth Mindset` },
  { id: 53, name: 'Self-Efficacy', label: `Adaptive Execution${SEP}Learning Agility${SEP}Self-Efficacy` },
  { id: 61, name: 'Perseverance', label: `Sustained Tenacity${SEP}Perseverance` },
];

/** One row exactly as the AI mapper writes it — paths in the score cells. */
function mappedRow(stem: string, path: string, scores: number[]) {
  const row: Record<string, string> = {
    stem, description: '', type: 'TEXT', mediaUrl: '', risk: '', shuffle: '',
    selectRule: '', selectCount: '', section: '', scores: '',
  };
  ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'].forEach((text, i) => {
    row[`option${i + 1}`] = text;
    row[`option${i + 1}Description`] = '';
    row[`option${i + 1}Scores`] = `${path}:${scores[i]}`;
  });
  return row;
}

describe('looksLikeOurTemplate', () => {
  it('is the presence of a stem column, however it is spelt', () => {
    expect(looksLikeOurTemplate([{ stem: 'x' }])).toBe(true);
    expect(looksLikeOurTemplate([{ Stem: 'x' }])).toBe(true);
    expect(looksLikeOurTemplate([{ ' STEM ': 'x' }])).toBe(true);
  });

  it('is false for a foreign sheet and for an empty one', () => {
    // "Statement" is what the reference workbook calls it — and it must NOT
    // count, or the fork would never be offered for exactly that file.
    expect(looksLikeOurTemplate([{ Statement: 'x', Factor: 'y' }])).toBe(false);
    expect(looksLikeOurTemplate([])).toBe(false);
  });
});

describe('mqtKeyResolver', () => {
  const errors: string[] = [];
  const resolve = mqtKeyResolver(choices);
  const at = (key: string) => resolve(key, 'here', errors);

  it('takes an id', () => {
    expect(at('42')).toBe(42);
    expect(at('999')).toBeNull();
  });

  it('takes a bare name only when it is unambiguous', () => {
    expect(at('Growth Mindset')).toBe(42);
    expect(at('growth mindset')).toBe(42);
    errors.length = 0;
    expect(at('Self-Efficacy')).toBeNull();
    expect(errors[0]).toContain('matches 2');
  });

  it('takes a full tree path, which disambiguates without an id', () => {
    // §15.1 — the round-trip bug. Both of these were "no MQT named …" before.
    expect(at(`Internal Drive${SEP}Self-Efficacy`)).toBe(41);
    expect(at(`Adaptive Execution${SEP}Learning Agility${SEP}Self-Efficacy`)).toBe(53);
  });

  it('is lenient about spacing around the separator but not about the segments', () => {
    expect(at(`internal drive›self-efficacy`)).toBe(41);
    expect(at(`Internal Drive  ${SEP}  Self-Efficacy`)).toBe(41);
    errors.length = 0;
    expect(at(`Internal Drive${SEP}Nope`)).toBeNull();
    expect(errors[0]).toContain('no measured quality type at');
  });
});

describe('parseQuestionRows — the template upload', () => {
  it('reads a hand-written template row', () => {
    const out = parseQuestionRows([{
      stem: 'I plan ahead.', type: 'TEXT', selectRule: 'max', selectCount: '2',
      option1: 'Yes', option1Scores: 'Growth Mindset:3', option2: 'No', option2Scores: '42:0', option3: 'Maybe',
    }], choices);

    expect(out.errors).toEqual([]);
    expect(out.payloads).toHaveLength(1);
    const q = out.payloads[0];
    expect(q.selectionRule).toBe('MAX');
    expect(q.selectionCount).toBe(2);
    expect(q.options.map((o) => o.mqtScores[0]?.measuredQualityTypeId ?? null)).toEqual([42, 42, null]);
  });

  it('refuses a selection rule it does not understand rather than dropping it', () => {
    const out = parseQuestionRows([{
      stem: 's', selectRule: 'Admin_Position order', selectCount: '15', option1: 'a', option2: 'b',
    }], choices);
    expect(out.errors.some((e) => e.includes('not min/max/equals'))).toBe(true);
  });

  it('says exactly "No data rows found in the sheet" for an empty sheet', () => {
    // The fork keys on the ABSENCE of this message — it must stay word for word.
    expect(parseQuestionRows([], choices).errors).toEqual(['No data rows found in the sheet']);
  });
});

describe('parseQuestionRows — the round trip', () => {
  it('re-imports what the AI mapper wrote, identically, through the template resolver', () => {
    // Three rows shaped exactly like docs/mapped-questions.xlsx: I1 and I2
    // ascending, I3 reverse-scored on the same construct as I2. This is the
    // §6.3 claim as a standing test: the downloaded sheet comes back through
    // the ORDINARY upload with no special handling.
    const rows = [
      mappedRow('If I get a totally new kind of task or role, I am sure I can learn what it needs.',
        `Internal Drive${SEP}Self-Efficacy`, [1, 2, 3, 4, 5]),
      mappedRow('Even in things I am weak at today, regular practice can make me really good at them.',
        `Internal Drive${SEP}Growth Mindset`, [1, 2, 3, 4, 5]),
      mappedRow('When something does not come naturally to me, I take it as a sign I am just not built for it.',
        `Internal Drive${SEP}Growth Mindset`, [5, 4, 3, 2, 1]),
    ];

    const out = parseQuestionRows(rows, choices);

    expect(out.errors).toEqual([]);
    expect(out.payloads).toHaveLength(3);
    const scores = (i: number) => out.payloads[i].options.map((o) => o.mqtScores[0]);
    expect(scores(0).map((s) => s.measuredQualityTypeId)).toEqual([41, 41, 41, 41, 41]);
    expect(scores(0).map((s) => s.score)).toEqual([1, 2, 3, 4, 5]);
    expect(scores(2).map((s) => s.measuredQualityTypeId)).toEqual([42, 42, 42, 42, 42]);
    expect(scores(2).map((s) => s.score)).toEqual([5, 4, 3, 2, 1]);
    // Single choice: both selection cells blank, exactly as the mapper writes them.
    expect(out.payloads[0].selectionRule).toBeNull();
  });
});

describe('collectingResolver', () => {
  it('resolves what exists and says nothing about it', () => {
    const unresolved = new Map<string, Set<number>>();
    const errors: string[] = [];
    const resolve = collectingResolver(choices, unresolved);

    expect(resolve('Growth Mindset', 'Row 2 scores', errors)).toBe(42);
    expect(unresolved.size).toBe(0);
    expect(errors).toEqual([]);
  });

  it('collects an unknown name instead of refusing the sheet', () => {
    const unresolved = new Map<string, Set<number>>();
    const errors: string[] = [];
    const resolve = collectingResolver(choices, unresolved);

    expect(resolve('Curiosity', 'Row 2 option1Scores', errors)).toBeNull();
    resolve('Curiosity', 'Row 2 option2Scores', errors);
    resolve('Curiosity', 'Row 7 option1Scores', errors);

    expect(errors).toEqual([]);
    // Two rows, five cells: the review screen counts questions.
    expect(unresolvedCounts(unresolved)).toEqual([{ pathKey: 'Curiosity', questionCount: 2 }]);
  });

  it('still refuses the two misses nothing could create', () => {
    const unresolved = new Map<string, Set<number>>();
    const errors: string[] = [];
    const resolve = collectingResolver(choices, unresolved);

    // An id that is not there names nothing to create...
    expect(resolve('999', 'Row 2 scores', errors)).toBeNull();
    // ...and a name matching two MQTs does not say which was meant.
    expect(resolve('Self-Efficacy', 'Row 3 scores', errors)).toBeNull();

    expect(unresolved.size).toBe(0);
    expect(errors).toEqual([
      'Row 2 scores: no MQT with id 999',
      'Row 3 scores: "Self-Efficacy" matches 2 MQTs — use the id instead',
    ]);
  });
});

describe('planAwareResolver', () => {
  const plan = new Map<string, number | null>([
    ['Curiosity', -2],
    ['Left alone', null],
  ]);

  it('prefers what the bank already has', () => {
    const errors: string[] = [];
    expect(planAwareResolver(choices, plan)('Growth Mindset', 'Row 2 scores', errors)).toBe(42);
    expect(errors).toEqual([]);
  });

  it('hands back the pending ref for something about to be created', () => {
    const errors: string[] = [];
    expect(planAwareResolver(choices, plan)('Curiosity', 'Row 2 scores', errors)).toBe(-2);
    expect(errors).toEqual([]);
  });

  it('drops a score the reviewer left unmapped, without an error', () => {
    const errors: string[] = [];
    expect(planAwareResolver(choices, plan)('Left alone', 'Row 2 scores', errors)).toBeNull();
    expect(errors).toEqual([]);
  });

  it('still complains about a name nobody decided on', () => {
    const errors: string[] = [];
    expect(planAwareResolver(choices, plan)('Never seen', 'Row 9 scores', errors)).toBeNull();
    expect(errors).toEqual(['Row 9 scores: no MQT named "Never seen"']);
  });
});
