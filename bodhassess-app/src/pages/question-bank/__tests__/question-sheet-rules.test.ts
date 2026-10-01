import { describe, expect, it } from 'vitest';
import {
  classifySectionCell,
  collectingResolver,
  groupRowErrors,
  hasOptionColumns,
  LEADING_ITEM_NUMBER,
  looksLikeOurTemplate,
  mqtKeyResolver,
  parseQuestionRows,
  placeRow,
  planAwareResolver,
  sectionCellsAbove,
  stripItemNumber,
  unresolvedCounts,
  warningsForRow,
  type SectionRef,
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

  it('marks the option otherOption names as the "Other…" row, by its number', () => {
    const out = parseQuestionRows([{
      stem: 'How do you commute?', option1: 'Bus', option2: 'Cycle', option3: 'Other', otherOption: '3',
    }], choices);
    expect(out.errors).toEqual([]);
    expect(out.payloads[0].options.map((o) => o.contentType)).toEqual(['TEXT', 'TEXT', 'FREE_TEXT']);
    expect(out.payloads[0].options[2].optionText).toBe('Other');
  });

  it('refuses an otherOption that names no filled option column', () => {
    const out = parseQuestionRows([
      { stem: 'a', option1: 'x', option2: 'y', otherOption: '9' },
      { stem: 'b', option1: 'x', option2: '', otherOption: '2' },
      { stem: 'c', option1: 'x', otherOption: 'yes' },
    ], choices);
    expect(out.errors.filter((e) => e.includes('otherOption'))).toHaveLength(3);
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

  it('refuses a question with no options, and takes one with a single option', () => {
    const out = parseQuestionRows([
      { stem: 'Nothing to pick', Answer1: 'Yes', Answer2: 'No' },
      { stem: 'I have read the instructions.', option1: 'I understand' },
    ], choices);
    expect(out.errors).toEqual(['Row 2: no options — a question needs at least one (fill in option1, option2, …)']);
    expect(out.payloads).toHaveLength(1);
    expect(out.payloads[0].options).toHaveLength(1);
  });

  it('names the columns it does not recognise, without refusing the sheet over them', () => {
    const out = parseQuestionRows([
      { stem: 'a', option1: 'x', 'Option 2': 'y', 'option2 scores': '', score: 'Growth Mindset:1', Notes: '', __EMPTY: '' },
    ], choices);
    expect(out.errors).toEqual([]);
    // 'Option 2' and 'option2 scores' fold to known columns; 'score' is the typo.
    expect(out.unknownColumns).toEqual(['score', 'Notes']);
    expect(parseQuestionRows([{ stem: 'a', option1: 'x', __EMPTY: 'stray' }], choices).unknownColumns)
      .toEqual(['(a column with no header)']);
  });
});

describe('parseQuestionRows — score cells', () => {
  const scoresOf = (cell: string) => parseQuestionRows([{ stem: 's', option1: 'x', option1Scores: cell }], choices);

  it('reads a comma exactly like |, so "A:4, B:2" is two scores', () => {
    const comma = scoresOf('Growth Mindset:4, 61:2');
    const pipe = scoresOf('Growth Mindset:4 | 61:2');
    expect(comma.errors).toEqual([]);
    expect(comma.payloads[0].options[0].mqtScores).toEqual([
      { measuredQualityTypeId: 42, score: 4 },
      { measuredQualityTypeId: 61, score: 2 },
    ]);
    expect(comma.payloads[0].options[0].mqtScores).toEqual(pipe.payloads[0].options[0].mqtScores);
    // Mixed, and ids either side of a comma, are the same rule.
    expect(scoresOf('42:0.5,61:1 | 41:3').payloads[0].options[0].mqtScores).toHaveLength(3);
  });

  it('skips a decimal comma with a warning instead of guessing — the question still imports', () => {
    const out = scoresOf('Growth Mindset: 0,5');
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual([
      'Row 2 option1Scores: "Growth Mindset: 0,5" skipped — a comma separates scores, so it is not '
        + 'read as Growth Mindset: 0.5. The question imports without it; if that was meant, add the '
        + 'score on the question after import',
    ]);
    expect(out.payloads).toHaveLength(1);
    expect(out.payloads[0].options[0].mqtScores).toEqual([]);
    // Only the ambiguous entry goes; the rest of the cell still counts.
    const mixed = scoresOf('Growth Mindset: 0,5, 61:2');
    expect(mixed.errors).toEqual([]);
    expect(mixed.warnings).toHaveLength(1);
    expect(mixed.payloads[0].options[0].mqtScores).toEqual([{ measuredQualityTypeId: 61, score: 2 }]);
  });

  it('reads a quality name that has a comma in it as one name', () => {
    const withComma: MqtChoice[] = [
      ...choices,
      { id: 70, name: 'Quality, Testing & Operations', label: `Engineering${SEP}Quality, Testing & Operations` },
    ];
    const out = parseQuestionRows(
      [{ stem: 's', option1: 'x', option1Scores: 'Quality, Testing & Operations:1, 61:2' }], withComma);
    expect(out.errors).toEqual([]);
    expect(out.payloads[0].options[0].mqtScores).toEqual([
      { measuredQualityTypeId: 70, score: 1 },
      { measuredQualityTypeId: 61, score: 2 },
    ]);
    // ...and a decimal comma after such a name is still caught.
    const decimal = parseQuestionRows(
      [{ stem: 's', option1: 'x', option1Scores: 'Quality, Testing & Operations: 0,5' }], withComma);
    expect(decimal.warnings).toHaveLength(1);
    expect(decimal.errors).toEqual([]);
  });

  it('hands the resolver the name exactly as the sheet spelled it', () => {
    // The AI route's plan keys on the sheet's own text; a normalised ", "
    // would miss "Quality,Testing".
    const keyToId = new Map<string, number | null>([['Quality,Testing & Ops', -1]]);
    const out = parseQuestionRows(
      [{ stem: 's', option1: 'x', option1Scores: 'Quality,Testing & Ops:4' }],
      choices,
      planAwareResolver(choices, keyToId),
    );
    expect(out.errors).toEqual([]);
    expect(out.payloads[0].options[0].mqtScores).toEqual([{ measuredQualityTypeId: -1, score: 4 }]);
  });

  it('still refuses a piece that never reaches a score', () => {
    expect(scoresOf('Growth Mindset:4, Perseverance').errors)
      .toEqual(['Row 2 option1Scores: "Perseverance" is not name:score']);
    // An unknown comma name is now one unknown name, not two half-names.
    expect(scoresOf('Anxiety, General:3').errors).toEqual(['Row 2 option1Scores: no MQT named "Anxiety, General"']);
  });
});

describe('warningsForRow', () => {
  it('picks one row and not the rows whose number starts the same', () => {
    const warnings = ['Row 7 option1Scores: a', 'Row 70 scores: b', 'Row 7 scores: c'];
    expect(warningsForRow(warnings, 7)).toEqual(['Row 7 option1Scores: a', 'Row 7 scores: c']);
    expect(warningsForRow(warnings, undefined)).toEqual([]);
  });
});

describe('groupRowErrors', () => {
  it('folds one message over many rows into one line, with ranges', () => {
    const errors = [
      'Row 2: section is blank', 'Row 3: section is blank', 'Row 4: section is blank',
      'Row 7 option1Scores: no MQT named "X"',
      'Row 9: section is blank',
      'No data rows found in the sheet',
    ];
    expect(groupRowErrors(errors)).toEqual([
      'Rows 2–4, 9 (4 rows): section is blank',
      'Row 7 option1Scores: no MQT named "X"',
      'No data rows found in the sheet',
    ]);
  });

  it('writes one unbroken run without a count', () => {
    const errors = Array.from({ length: 42 }, (_, i) => `Row ${i + 2}: no options`);
    expect(groupRowErrors(errors)).toEqual(['Rows 2–43: no options']);
  });
});

describe('stripItemNumber', () => {
  it('takes the numbering sheets put in front of a stem, and nothing else', () => {
    expect(stripItemNumber('1. I enjoy chatting. ')).toBe('I enjoy chatting.');
    expect(stripItemNumber('12) I enjoy calls')).toBe('I enjoy calls');
    expect(stripItemNumber('(3) Pick one')).toBe('Pick one');
    expect(stripItemNumber('Q4: Pick one')).toBe('Pick one');
    expect(stripItemNumber('2.5 hours is enough')).toBe('2.5 hours is enough');
    expect(stripItemNumber('1-2 times a week')).toBe('1-2 times a week');
    expect(stripItemNumber('10 minutes')).toBe('10 minutes');
    expect(LEADING_ITEM_NUMBER.test('I enjoy')).toBe(false);
  });
});

describe('hasOptionColumns', () => {
  it('is true only when some option1…N column exists', () => {
    expect(hasOptionColumns([{ stem: 'a', 'Option 1': 'x' }])).toBe(true);
    expect(hasOptionColumns([{ stem: 'a', A: 'x', B: 'y' }])).toBe(false);
    expect(hasOptionColumns([{ stem: 'a', option1Scores: '' }])).toBe(false);
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

describe('section placement', () => {
  const sections: SectionRef[] = [
    { sectionId: 1, name: 'Part A' },
    { sectionId: 2, name: 'Part B' },
    { sectionId: 3, name: 'Twice' },
    { sectionId: 4, name: ' twice ' },
  ];

  it('classifies a cell against the sections by trimmed, case-insensitive name', () => {
    expect(classifySectionCell('  part a ', sections)).toEqual({ kind: 'matched', sectionId: 1 });
    expect(classifySectionCell('', sections)).toEqual({ kind: 'blank' });
    expect(classifySectionCell(null, sections)).toEqual({ kind: 'blank' });
    expect(classifySectionCell('Part C', sections)).toEqual({ kind: 'unknown', key: 'part c', value: 'Part C' });
    expect(classifySectionCell('TWICE', sections)).toEqual({ kind: 'ambiguous', value: 'TWICE', count: 2 });
  });

  it('copies the nearest name above, never one from below', () => {
    expect(sectionCellsAbove(['', 'Part A', '', '', 'Part B', ''])).toEqual(
      [null, null, 'Part A', 'Part A', 'Part A', 'Part B']);
  });

  it('leaves blank and unknown rows unassigned unless somebody chose otherwise', () => {
    expect(placeRow('', null, sections, 'none', {})).toBeNull();
    expect(placeRow('Part C', null, sections, 'none', {})).toBeNull();
    expect(placeRow('Part B', null, sections, 'none', {})).toEqual({ sectionId: 2 });
  });

  it('follows the choices: an existing section, a new one, or fill down', () => {
    expect(placeRow('', null, sections, 'id:2', {})).toEqual({ sectionId: 2 });
    expect(placeRow('Part C', null, sections, 'none', { 'part c': 'new' })).toEqual({ createKey: 'part c' });
    expect(placeRow('Part C', null, sections, 'none', { 'part c': 'id:1' })).toEqual({ sectionId: 1 });
    // Fill down resolves the copied name like any other — including a new one.
    expect(placeRow('', 'Part A', sections, 'fill', {})).toEqual({ sectionId: 1 });
    expect(placeRow('', 'Part C', sections, 'fill', { 'part c': 'new' })).toEqual({ createKey: 'part c' });
    expect(placeRow('', null, sections, 'fill', {})).toBeNull();
    // 'off' places nothing: the questionnaire is about to have no sections.
    expect(placeRow('', null, sections, 'off', {})).toBeNull();
  });
});
