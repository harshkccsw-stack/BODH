package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.scoring.OptionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionMqtScoreRepository;
import com.bodhpsychometric.service.MqtScoringService;

/**
 * How big a trait's numbers can get on a given assessment.
 *
 * <h2>The failure this exists to catch</h2>
 *
 * A rule is portable to another assessment when every column it names resolves
 * there. That check is necessary and <b>not sufficient</b>, and the gap is the
 * most dangerous thing about reusing rules at all:
 *
 * <p>{@code mqt:14} is a global taxonomy id, so "Internal Drive" means the same
 * trait everywhere. It does <b>not</b> mean the same NUMBER everywhere. Written
 * against an instrument where four items feed that trait, the score runs 4–20
 * and {@code NORMBAND(x, 34, 'Developing', 48, 'Moderate', 'High')} bands it
 * sensibly. Move the rule to an instrument where eight items feed it, the score
 * runs 8–40, every key still resolves, every validation still passes — and the
 * band cut now means something entirely different. Nobody finds out until
 * someone reads a stack of reports and notices everybody is "High".
 *
 * <p>So the probe reports, per trait, <b>how many questions feed it</b> and
 * <b>the largest score it can reach</b>. Comparing those between the assessment
 * a rule was validated against and the one it is being offered for turns that
 * silent difference into a warning the author sees before they adopt it.
 *
 * <h2>Why the maximum and not the observed range</h2>
 *
 * The observed range moves with whoever has answered so far, and is empty
 * before anyone has. The theoretical maximum is a property of the instrument —
 * it is the same on the day the questionnaire is built as it is a year later,
 * which is what makes it comparable between two assessments.
 *
 * <p>Read live, never cached, for the reason {@link ReportColumnCatalog} gives:
 * unplace a question and this changes, and a cached answer would go stale
 * silently.
 */
@Service
public class ReportShapeProbe {

    /**
     * @param questions how many placed questions contribute any score to the trait
     * @param maxPossible the largest total the trait can reach — flat question
     *        scores plus, per question, its best-scoring option
     */
    public record MqtShape(int questions, double maxPossible) {
    }

    private final AssessmentRepository assessments;
    private final QuestionMqtScoreRepository questionScores;
    private final OptionMqtScoreRepository optionScores;
    private final MqtScoringService scoring;

    public ReportShapeProbe(AssessmentRepository assessments,
            QuestionMqtScoreRepository questionScores,
            OptionMqtScoreRepository optionScores,
            MqtScoringService scoring) {
        this.assessments = assessments;
        this.questionScores = questionScores;
        this.optionScores = optionScores;
        this.scoring = scoring;
    }

    /**
     * Shapes keyed by the COLUMN KEY a formula actually writes — {@code mqt:14},
     * {@code mqtt:14}, {@code mq:3} — not by raw trait id.
     *
     * <p>Composites are included on purpose. Band rules are the ones most often
     * written against a whole quality ({@code mq:}) or a subtree total
     * ({@code mqtt:}), and they are also the least portable kind of rule, so a
     * probe that only understood leaf traits would miss the case it matters
     * most for.
     *
     * <p>A composite's question count is the number of DISTINCT questions
     * feeding anything beneath it, not the sum of its children's counts — one
     * item scoring two sibling traits is still one item.
     */
    @Transactional(readOnly = true)
    public Map<String, MqtShape> shapeOf(Long assessmentId) {
        Assessment assessment = assessments.findById(assessmentId).orElse(null);
        if (assessment == null || assessment.getQuestionnaire() == null) {
            return Map.of();
        }
        Long questionnaireId = assessment.getQuestionnaire().getQuestionnaireId();

        // mqtId → questionId → the best this question can contribute.
        Map<Long, Map<Long, Double>> best = new LinkedHashMap<>();

        for (Object[] row : questionScores.findForQuestionnaire(questionnaireId)) {
            add(best, id(row[1]), id(row[0]), num(row[2]));
        }
        // An option-scored question contributes its highest-scoring option, not
        // the sum of them: a respondent picks one. Multi-select would exceed
        // this, which is the safe direction for a comparison — both sides of the
        // comparison are computed the same way.
        for (Object[] row : optionScores.findQuestionShapeFor(questionnaireId)) {
            addMax(best, id(row[1]), id(row[0]), num(row[2]));
        }

        MqtScoringService.ScoringPlan plan = scoring.planFor(questionnaireId);

        Map<String, MqtShape> out = new LinkedHashMap<>();
        best.forEach((mqtId, byQuestion) -> out.put("mqt:" + mqtId, shapeFrom(byQuestion)));

        for (MqtScoringService.MqtRef mqt : plan.mqts()) {
            List<Long> subtree = plan.subtrees()
                    .getOrDefault(mqt.measuredQualityTypeId(), List.of(mqt.measuredQualityTypeId()));
            out.put("mqtt:" + mqt.measuredQualityTypeId(), shapeFrom(merge(best, subtree)));
        }

        Map<Long, List<Long>> byMq = new LinkedHashMap<>();
        for (MqtScoringService.MqtRef mqt : plan.mqts()) {
            byMq.computeIfAbsent(mqt.measuredQualityId(), k -> new ArrayList<>())
                    .add(mqt.measuredQualityTypeId());
        }
        byMq.forEach((mqId, mqtIds) -> out.put("mq:" + mqId, shapeFrom(merge(best, mqtIds))));

        return out;
    }

    /** Union the per-question contributions of several traits. */
    private static Map<Long, Double> merge(Map<Long, Map<Long, Double>> best, List<Long> mqtIds) {
        Map<Long, Double> merged = new HashMap<>();
        for (Long mqtId : mqtIds) {
            best.getOrDefault(mqtId, Map.of())
                    .forEach((questionId, score) -> merged.merge(questionId, score, Double::sum));
        }
        return merged;
    }

    private static MqtShape shapeFrom(Map<Long, Double> byQuestion) {
        return new MqtShape(byQuestion.size(),
                byQuestion.values().stream().mapToDouble(Double::doubleValue).sum());
    }

    private static void add(Map<Long, Map<Long, Double>> best, Long mqtId, Long questionId,
            double score) {
        best.computeIfAbsent(mqtId, k -> new HashMap<>()).merge(questionId, score, Double::sum);
    }

    private static void addMax(Map<Long, Map<Long, Double>> best, Long mqtId, Long questionId,
            double score) {
        best.computeIfAbsent(mqtId, k -> new HashMap<>()).merge(questionId, score, Double::max);
    }

    private static Long id(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static double num(Object value) {
        return value == null ? 0d : ((Number) value).doubleValue();
    }
}
