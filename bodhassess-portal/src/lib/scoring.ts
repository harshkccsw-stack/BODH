// Pure scoring logic, extracted verbatim (behaviour-preserving) from the
// admin app's portal/take.tsx submit(). No React, no I/O — easy to test.

import type { MQT, MQTScore, Questionnaire } from '@/lib/api';

// Depth-first walk over every MQT in the tree (any depth).
export function walkMqts(nodes: MQT[] = [], visit: (n: MQT) => void): void {
  for (const n of nodes) {
    visit(n);
    if (n.children?.length) walkMqts(n.children, visit);
  }
}

export interface ScoreResult {
  // Keyed by MQT id, carrying the resolved name so reports can render labels
  // without the MQ tree handy.
  mqtScores: Record<string, MQTScore>;
  // "name=score, name=score, …" or "Submitted" when nothing scored.
  summary: string;
}

/**
 * Compute per-MQT totals from the respondent's answers.
 *
 * - Only MQTs that an option/question actually scored against appear in the
 *   result (no auto roll-ups for parent MQTs).
 * - Empty free-text answers are treated as unanswered (no question-level credit).
 */
export function scoreAssessment(
  instrument: Questionnaire,
  answers: Record<string, number | string>,
): ScoreResult {
  const mqtName: Record<string, string> = {};
  const totals: Record<string, number> = {};
  instrument.mqs.forEach((mq) =>
    walkMqts(mq.mqts, (t) => {
      mqtName[t.id] = t.name;
      totals[t.id] = 0;
    }),
  );

  const scored = new Set<string>();
  instrument.questions.forEach((q) => {
    const ans = answers[q.id];
    if (ans === undefined) return;
    if (typeof ans === 'string' && ans.trim() === '') return; // empty free-text

    // Question-level scores apply on any non-empty answer.
    (q.question_scores || []).forEach((s) => {
      totals[s.mqt_id] = (totals[s.mqt_id] || 0) + s.score;
      scored.add(s.mqt_id);
    });

    if (typeof ans !== 'number') return; // free-text — no per-option contribution
    const opt = q.options[ans];
    if (!opt) return;
    (opt.scores || []).forEach((s) => {
      totals[s.mqt_id] = (totals[s.mqt_id] || 0) + s.score;
      scored.add(s.mqt_id);
    });
  });

  const mqtScores: Record<string, MQTScore> = {};
  scored.forEach((id) => {
    mqtScores[id] = { name: mqtName[id] || id, score: totals[id] };
  });

  const summary =
    Object.values(mqtScores)
      .map((v) => `${v.name}=${v.score}`)
      .join(', ') || 'Submitted';

  return { mqtScores, summary };
}
