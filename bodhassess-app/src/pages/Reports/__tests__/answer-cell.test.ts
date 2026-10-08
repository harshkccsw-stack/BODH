import { describe, expect, it } from 'vitest';
import { answerCell, type QuestionColumn } from '../reportApis';

/**
 * A question's cell in the Raw Data sheet: a whole-number short answer is
 * written as a NUMBER, every other answer as the text it is.
 */
describe('answer cells in the Raw Data sheet', () => {
  const column = (answerFormat: QuestionColumn['answerFormat']): QuestionColumn => ({
    questionTag: 'Q_1',
    questionId: 1,
    stem: 'How many?',
    questionRowId: null,
    rowText: null,
    answerFormat,
  });

  it('writes a whole-number answer as a number', () => {
    expect(answerCell(column('WHOLE_NUMBER'), '42')).toBe(42);
    expect(answerCell(column('WHOLE_NUMBER'), '007')).toBe(7);
    expect(answerCell(column('WHOLE_NUMBER'), '0')).toBe(0);
  });

  it('keeps anything that is not plain digits as text, never coerced or dropped', () => {
    // Written before the question was limited, or synced from MemoryMesh.
    expect(answerCell(column('WHOLE_NUMBER'), 'about 5')).toBe('about 5');
    expect(answerCell(column('WHOLE_NUMBER'), '12.5')).toBe('12.5');
    expect(answerCell(column('WHOLE_NUMBER'), '1234567890123456')).toBe('1234567890123456');
  });

  it('leaves text answers as text, and a missing answer blank', () => {
    expect(answerCell(column('TEXT'), '42')).toBe('42');
    expect(answerCell(column(undefined), '42')).toBe('42');
    expect(answerCell(column('WHOLE_NUMBER'), undefined)).toBe('');
  });
});
