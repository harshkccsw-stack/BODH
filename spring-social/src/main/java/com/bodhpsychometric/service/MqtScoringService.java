package com.bodhpsychometric.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.taxonomy.MeasuredQuality;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;
import com.bodhpsychometric.repository.measures.MeasuredQualityTypeRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.scoring.OptionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionRowMqtRepository;

/**
 * Turns answers into MQ / MQT numbers — the scoring engine. Everything before
 * this only ever STORED the scoring edges ({@code QuestionMqtScore},
 * {@code OptionMqtScore}, {@code QuestionRowMqt}, all written by the question
 * editor); nothing had yet added them up.
 *
 * <h2>The rule</h2>
 * A respondent's score on MQT <em>m</em> for one assessment is the sum of
 * <ul>
 * <li>{@code OptionMqtScore(option, m)} for every option they selected, and</li>
 * <li>{@code QuestionMqtScore(question, m)} for every question they answered —
 * counted ONCE per question, not once per selected option, which is what a
 * multi-select would otherwise do to it.</li>
 * </ul>
 *
 * Per question type that comes out as:
 * <ul>
 * <li><b>MCQ</b> — the selected options' scores plus the flat question score.</li>
 * <li><b>LINEAR_SCALE</b> — the same code with no special case: the generated
 * points already carry derived option scores (point <em>n</em> scores
 * <em>n</em>) and the question-level row is stored 0 on write, so adding the
 * flat part is a no-op.</li>
 * <li><b>LIKERT_GRID</b> — a pick on row <em>R</em> of column <em>C</em>
 * credits ONLY the MQTs that <em>R</em> nominates, each with the score
 * <em>C</em> carries for it. The one type whose option scores are filtered.</li>
 * </ul>
 *
 * <h2>Rollups</h2>
 * MQT is a tree of any depth and a score may attach at any node, so three
 * numbers come out per respondent: a node's OWN score, its SUBTREE total
 * (own + every descendant), and the MQ total (every node of that MQ).
 *
 * <h2>Shape</h2>
 * {@link #planFor(Long)} does all the reading — five queries, once per export,
 * never per respondent — and {@link #score} is then pure computation over
 * answers the caller already holds. It lives here rather than inside the
 * report's sheet builder because the results screen, the PDF report and
 * BodhLens all want this same number, and a private copy would drift.
 */
@Service
public class MqtScoringService {

    /** Path separator between ancestors — escaped so the source stays ASCII. */
    private static final String PATH_SEPARATOR = " \u203a ";

    private final QuestionMqtScoreRepository questionScores;
    private final OptionMqtScoreRepository optionScores;
    private final QuestionRowMqtRepository rowNominations;
    private final MeasuredQualityTypeRepository measuredQualityTypes;
    private final QuestionnaireQuestionRepository placements;

    public MqtScoringService(QuestionMqtScoreRepository questionScores,
            OptionMqtScoreRepository optionScores,
            QuestionRowMqtRepository rowNominations,
            MeasuredQualityTypeRepository measuredQualityTypes,
            QuestionnaireQuestionRepository placements) {
        this.questionScores = questionScores;
        this.optionScores = optionScores;
        this.rowNominations = rowNominations;
        this.measuredQualityTypes = measuredQualityTypes;
        this.placements = placements;
    }

    /** An MQ that at least one of this questionnaire's questions measures. */
    public record MqRef(Long measuredQualityId, String name) {
    }

    /**
     * One MQT column. {@code path} is the label — MQT names are deliberately
     * not unique ("Attention" may sit under several MQs), so a bare name would
     * make two columns read identically.
     */
    public record MqtRef(Long measuredQualityTypeId, Long measuredQualityId, String mqName,
            String name, String path, int depth, Long parentTypeId, boolean hasChildren) {
    }

    /**
     * Everything one questionnaire's scoring needs, read once. The maps are
     * keyed by the ids that {@link AssessmentAnswer} carries, so scoring a
     * respondent is lookups only.
     */
    public record ScoringPlan(
            /** Questions the questionnaire currently places — answers outside it do not count. */
            Set<Long> placedQuestionIds,
            /** questionId → mqtId → flat score. */
            Map<Long, Map<Long, Double>> questionScores,
            /** optionId → mqtId → score. */
            Map<Long, Map<Long, Double>> optionScores,
            /** questionRowId → the MQTs that row measures (the grid filter). */
            Map<Long, Set<Long>> rowNominations,
            /** Involved MQs, by name. */
            List<MqRef> mqs,
            /** Involved MQTs, MQ by MQ, depth-first in tree order. */
            List<MqtRef> mqts,
            /** mqtId → itself + every kept descendant, for the subtree total. */
            Map<Long, List<Long>> subtrees) {
    }

    /**
     * One respondent's numbers. Every involved MQT/MQ is present — a trait the
     * respondent scored nothing on is 0, not absent, because only COMPLETED
     * attempts are ever scored, so the absence is a real zero and a blank
     * would break any average taken over the column.
     */
    public record Scores(
            /** mqtId → the node's own score. */
            Map<Long, Double> mqtScores,
            /** mqtId → own + every descendant. */
            Map<Long, Double> mqtTotals,
            /** mqId → every node of that MQ. */
            Map<Long, Double> mqScores) {
    }

    /**
     * Read the scoring edges of one questionnaire and lay out its MQ / MQT
     * columns. Five queries regardless of how many respondents are exported.
     */
    @Transactional(readOnly = true)
    public ScoringPlan planFor(Long questionnaireId) {
        Set<Long> placed = new HashSet<>(placements.findPlacedQuestionIds(questionnaireId));
        Map<Long, Map<Long, Double>> byQuestion = scoreMap(questionScores.findForQuestionnaire(questionnaireId));
        Map<Long, Map<Long, Double>> byOption = scoreMap(optionScores.findForQuestionnaire(questionnaireId));

        Map<Long, Set<Long>> byRow = new HashMap<>();
        for (Object[] row : rowNominations.findForQuestionnaire(questionnaireId)) {
            byRow.computeIfAbsent(id(row[0]), k -> new HashSet<>()).add(id(row[1]));
        }

        // Every MQT this questionnaire touches, from all three levels.
        Set<Long> referenced = new LinkedHashSet<>();
        byQuestion.values().forEach(m -> referenced.addAll(m.keySet()));
        byOption.values().forEach(m -> referenced.addAll(m.keySet()));
        byRow.values().forEach(referenced::addAll);
        if (referenced.isEmpty()) {
            return new ScoringPlan(placed, byQuestion, byOption, byRow, List.of(), List.of(), Map.of());
        }

        List<MeasuredQualityType> forest = measuredQualityTypes.findForestOf(referenced);
        return buildColumns(placed, byQuestion, byOption, byRow, referenced, forest);
    }

    /**
     * Lay the forest out as ordered columns. Only the referenced nodes AND
     * their ancestors are kept: an ancestor is needed for its path label and
     * for a subtree total to mean anything, but an unrelated sibling branch
     * would only add columns that are 0 for every respondent.
     */
    private ScoringPlan buildColumns(Set<Long> placed,
            Map<Long, Map<Long, Double>> byQuestion,
            Map<Long, Map<Long, Double>> byOption,
            Map<Long, Set<Long>> byRow,
            Set<Long> referenced,
            List<MeasuredQualityType> forest) {

        Map<Long, MeasuredQualityType> byId = new HashMap<>();
        forest.forEach(t -> byId.put(t.getMeasuredQualityTypeId(), t));

        Set<Long> keep = new HashSet<>();
        for (Long id : referenced) {
            for (MeasuredQualityType node = byId.get(id); node != null; node = node.getParent()) {
                if (!keep.add(node.getMeasuredQualityTypeId())) {
                    break; // this ancestor chain is already in — so is the rest of it
                }
            }
        }

        // parentTypeId → children, and per MQ its roots; both in author order.
        Comparator<MeasuredQualityType> treeOrder = Comparator
                .comparingInt(MeasuredQualityType::getSortOrder)
                .thenComparing(MeasuredQualityType::getMeasuredQualityTypeId);
        Map<Long, List<MeasuredQualityType>> children = new HashMap<>();
        Map<Long, List<MeasuredQualityType>> rootsByMq = new HashMap<>();
        Map<Long, MeasuredQuality> mqById = new LinkedHashMap<>();
        for (MeasuredQualityType node : forest) {
            if (!keep.contains(node.getMeasuredQualityTypeId())) {
                continue;
            }
            MeasuredQualityType parent = node.getParent();
            if (parent == null) {
                MeasuredQuality mq = node.getMeasuredQuality();
                mqById.putIfAbsent(mq.getMeasuredQualityId(), mq);
                rootsByMq.computeIfAbsent(mq.getMeasuredQualityId(), k -> new ArrayList<>()).add(node);
            } else {
                children.computeIfAbsent(parent.getMeasuredQualityTypeId(), k -> new ArrayList<>()).add(node);
            }
        }
        children.values().forEach(list -> list.sort(treeOrder));
        rootsByMq.values().forEach(list -> list.sort(treeOrder));

        List<MqRef> mqs = mqById.values().stream()
                .sorted(Comparator.comparing(MeasuredQuality::getName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(MeasuredQuality::getMeasuredQualityId))
                .map(mq -> new MqRef(mq.getMeasuredQualityId(), mq.getName()))
                .toList();

        List<MqtRef> mqts = new ArrayList<>();
        Map<Long, List<Long>> subtrees = new HashMap<>();
        for (MqRef mq : mqs) {
            for (MeasuredQualityType root : rootsByMq.getOrDefault(mq.measuredQualityId(), List.of())) {
                walk(root, mq.name(), mq.name(), 0, children, keep, mqts, subtrees);
            }
        }
        return new ScoringPlan(placed, byQuestion, byOption, byRow, mqs, mqts, subtrees);
    }

    /**
     * Depth-first, appending each node's column and recording its subtree on
     * the way back up. The path starts at the MQ name, so a label reads
     * "Cognition &rsaquo; Verbal &rsaquo; Vocabulary" and stands alone.
     */
    private void walk(MeasuredQualityType node, String mqName, String parentPath, int depth,
            Map<Long, List<MeasuredQualityType>> children, Set<Long> keep,
            List<MqtRef> out, Map<Long, List<Long>> subtrees) {
        Long id = node.getMeasuredQualityTypeId();
        String path = parentPath + PATH_SEPARATOR + node.getName();
        List<MeasuredQualityType> kids = children.getOrDefault(id, List.of()).stream()
                .filter(c -> keep.contains(c.getMeasuredQualityTypeId()))
                .toList();
        out.add(new MqtRef(id, node.getMeasuredQuality().getMeasuredQualityId(), mqName,
                node.getName(), path, depth,
                node.getParent() == null ? null : node.getParent().getMeasuredQualityTypeId(),
                !kids.isEmpty()));

        List<Long> subtree = new ArrayList<>();
        subtree.add(id);
        for (MeasuredQualityType kid : kids) {
            walk(kid, mqName, path, depth + 1, children, keep, out, subtrees);
            subtree.addAll(subtrees.get(kid.getMeasuredQualityTypeId()));
        }
        subtrees.put(id, subtree);
    }

    /**
     * Score one respondent from the answers of a single (respondent,
     * assessment) pair. Pure computation — the caller already holds the
     * answers with question, option and grid row fetched.
     */
    public Scores score(List<AssessmentAnswer> answers, ScoringPlan plan) {
        Map<Long, Double> own = new LinkedHashMap<>();
        plan.mqts().forEach(m -> own.put(m.measuredQualityTypeId(), 0d));

        Set<Long> answeredQuestions = new LinkedHashSet<>();
        for (AssessmentAnswer answer : answers) {
            Long questionId = answer.getQuestion().getQuestionId();
            if (!plan.placedQuestionIds().contains(questionId)) {
                // Unplaced since the attempt: it has no answer column in the
                // sheet either, and a total must not count what is not shown.
                continue;
            }
            answeredQuestions.add(questionId);

            Option option = answer.getOption();
            if (option == null) {
                continue; // formats with no option (free text) carry no score yet
            }
            Map<Long, Double> perMqt = plan.optionScores().get(option.getOptionId());
            if (perMqt == null) {
                continue;
            }
            // Grid: the row decides WHICH of the column's scores apply.
            Set<Long> nominated = answer.getQuestionRow() == null ? null
                    : plan.rowNominations().getOrDefault(answer.getQuestionRow().getQuestionRowId(), Set.of());
            for (Map.Entry<Long, Double> entry : perMqt.entrySet()) {
                if (nominated != null && !nominated.contains(entry.getKey())) {
                    continue;
                }
                add(own, entry.getKey(), entry.getValue());
            }
        }
        // Once per ANSWERED question — a multi-select must not multiply it.
        for (Long questionId : answeredQuestions) {
            plan.questionScores().getOrDefault(questionId, Map.of())
                    .forEach((mqtId, score) -> add(own, mqtId, score));
        }

        Map<Long, Double> totals = new LinkedHashMap<>();
        Map<Long, Double> mqTotals = new LinkedHashMap<>();
        plan.mqs().forEach(mq -> mqTotals.put(mq.measuredQualityId(), 0d));
        for (MqtRef mqt : plan.mqts()) {
            double subtreeTotal = 0;
            for (Long descendant : plan.subtrees().getOrDefault(mqt.measuredQualityTypeId(), List.of())) {
                subtreeTotal += own.getOrDefault(descendant, 0d);
            }
            totals.put(mqt.measuredQualityTypeId(), round(subtreeTotal));
            mqTotals.merge(mqt.measuredQualityId(), own.getOrDefault(mqt.measuredQualityTypeId(), 0d), Double::sum);
        }
        own.replaceAll((id, value) -> round(value));
        mqTotals.replaceAll((id, value) -> round(value));
        return new Scores(own, totals, mqTotals);
    }

    /**
     * Every number this service hands out is rounded to 2 decimals, the same
     * precision the editor stores. Scores are doubles, so a column of quarters
     * and thirds adds up to 8.999999999999998 in binary — true, unreadable,
     * and different in the sheet from the same total typed by hand. Rounding
     * once at the exit keeps the sums themselves exact.
     */
    private static double round(double value) {
        return Math.round(value * 100d) / 100d;
    }

    /** Adds only to a column that exists — a score with no column is unreachable anyway. */
    private static void add(Map<Long, Double> target, Long mqtId, double score) {
        if (target.containsKey(mqtId)) {
            target.merge(mqtId, score, Double::sum);
        }
    }

    /** (ownerId, mqtId, score) rows → ownerId → mqtId → score. */
    private static Map<Long, Map<Long, Double>> scoreMap(List<Object[]> projection) {
        Map<Long, Map<Long, Double>> result = new HashMap<>();
        for (Object[] row : projection) {
            result.computeIfAbsent(id(row[0]), k -> new LinkedHashMap<>())
                    .put(id(row[1]), ((Number) row[2]).doubleValue());
        }
        return result;
    }

    private static Long id(Object value) {
        return ((Number) value).longValue();
    }
}
