package com.bodhpsychometric.service.report;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.dto.ReportDryRunRequest;
import com.bodhpsychometric.dto.ReportDryRunResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.repository.report.ReportRuleRepository;
import com.bodhpsychometric.service.datastudio.DataStudioDatasetService;
import com.bodhpsychometric.service.datastudio.expression.ExpressionEvaluator;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;

/**
 * Runs the rules over real respondents with no AI and no sandbox.
 *
 * <h2>Why this exists before codegen does</h2>
 *
 * <p>The delivery path is generated Python in a sandboxed container, and none
 * of it is built yet. Without something like this, an author writing a scoring
 * pipeline gets no feedback at all beyond "the formula parses" — and "parses"
 * has never been the interesting question. The interesting question is whether
 * the composite comes to 44 for the respondent the psychometrician worked by
 * hand, and whether the bands put a sane fraction of the cohort in each.
 *
 * <p>The machinery to answer that already existed: {@link ExpressionEvaluator}
 * runs the same grammar the rules are written in, over the same dataset the
 * columns come from. The report engine's plan called the expression branch
 * "defined but unused". For delivery it is. For checking the author's work it
 * is a free reference implementation, and later it is the oracle generated
 * Python is diffed against.
 *
 * <h2>Three things that are load-bearing</h2>
 *
 * <ol>
 *   <li><b>A fresh evaluator per rule.</b> {@code ExpressionEvaluator} caches
 *       aggregates under {@code Call.id}, which is assigned per PARSE and so
 *       restarts at zero for every expression. Share one evaluator across two
 *       separately parsed rules and the second rule's {@code ZSCORE} silently
 *       returns the first rule's — a wrong number, not an error. One evaluator
 *       per rule is what stops that.</li>
 *   <li><b>Failure is loud and it propagates.</b> Data Studio's sheet compute
 *       catches a bad formula, writes null into the cell and carries on, which
 *       is right for a spreadsheet. Here a null score is a wrong report, so a
 *       rule that fails is reported as failed, and every rule downstream of it
 *       is reported as failed too rather than quietly computing from a hole.</li>
 *   <li><b>Summaries cover the whole cohort, the row sample does not.</b> The
 *       distribution is the only view that catches a band cut written
 *       backwards, and a distribution over the first 25 rows is a different
 *       statistic wearing the same name.</li>
 * </ol>
 */
@Service
public class ReportDryRunService {

    /** Rows returned to the screen when the caller does not say. */
    private static final int DEFAULT_ROW_LIMIT = 25;
    private static final int MAX_ROW_LIMIT = 200;

    private final ReportRuleRepository rules;
    private final DataStudioDatasetService datasets;
    private final ExpressionService expressions;
    private final ReportAccess access;

    public ReportDryRunService(ReportRuleRepository rules,
            DataStudioDatasetService datasets,
            ExpressionService expressions,
            ReportAccess access) {
        this.rules = rules;
        this.datasets = datasets;
        this.expressions = expressions;
        this.access = access;
    }

    @Transactional(readOnly = true)
    /**
     * The whole cohort, every rule evaluated, nothing summarised or sampled.
     *
     * <p><b>This is the one evaluator.</b> The dry run summarises it; direct
     * report delivery resolves template tags from it. Two implementations of
     * one grammar is how the screen and the PDF come to disagree about a
     * respondent's score, and it would also destroy the reason this exists —
     * being the reference the generated Python is later diffed against.
     *
     * @param versions the EXACT version of each rule to run, by slug. Delivery
     *        passes the versions pinned into a computation, never the latest:
     *        what a human approved must not change because somebody edited a
     *        rule elsewhere in the library. A dependency absent from this map
     *        is treated as unavailable rather than silently resolved to latest.
     */
    public EvaluatedCohort evaluate(Long assessmentId, Long organizationId,
            List<ReportRule> ordered, Map<String, ReportRuleVersion> versions) {

        DsDatasetResponse dataset = datasets
                .dataset(assessmentId, organizationId)
                .orElseThrow(() -> new NotFoundException(
                        "Assessment " + assessmentId + " not found"));

        List<Map<String, Object>> population = dataset.rows();
        List<String> notes = new ArrayList<>();
        if (population.isEmpty()) {
            notes.add("No respondent has completed this assessment yet, so every rule ran "
                    + "against an empty cohort. Formulas are still checked; the numbers are not.");
        }

        List<ReportDryRunResponse.RuleOutcome> outcomes = new ArrayList<>();
        Set<String> failed = new LinkedHashSet<>();
        Set<String> unavailable = new LinkedHashSet<>();

        for (ReportRule rule : ordered) {
            ReportRuleVersion version = versions.get(rule.getSlug());
            if (version == null) {
                continue;
            }

            if (!version.isExpression()) {
                unavailable.add(rule.getSlug());
                outcomes.add(outcome(rule, version, ReportDryRunResponse.NEEDS_GENERATION,
                        null, null));
                continue;
            }

            String blockedBy = firstBlockedDependency(version, failed, unavailable);
            if (blockedBy != null) {
                failed.add(rule.getSlug());
                outcomes.add(outcome(rule, version, ReportDryRunResponse.ERROR,
                        "Depends on \"" + blockedBy + "\", which produced no value.", null));
                continue;
            }

            try {
                ExpressionService.Node root = expressions.parse(version.getExpression());
                // One evaluator per rule — see the class javadoc. Sharing one
                // would cross-contaminate cached aggregates between rules.
                ExpressionEvaluator evaluator = new ExpressionEvaluator(population);
                String key = ReportRuleService.RULE_PREFIX + rule.getSlug();
                for (Map<String, Object> row : population) {
                    // Written back into the SAME row maps the evaluator holds as
                    // its population, so a later rule can both read this value
                    // per row and take a percentile of it across the cohort.
                    row.put(key, evaluator.eval(root, row));
                }
                outcomes.add(outcome(rule, version, ReportDryRunResponse.EVALUATED, null,
                        summarise(population, key)));
            } catch (RuntimeException ex) {
                failed.add(rule.getSlug());
                outcomes.add(outcome(rule, version, ReportDryRunResponse.ERROR,
                        ex.getMessage() == null ? ex.toString() : ex.getMessage(), null));
            }
        }

        return new EvaluatedCohort(population, ordered, outcomes, failed, unavailable, notes);
    }

    /** The rules pinned into a computation, in dependency order, at their pinned versions. */
    public EvaluatedCohort evaluatePinned(Long assessmentId, Long organizationId,
            Collection<ReportRuleVersion> pinned) {
        Map<String, ReportRuleVersion> versions = new LinkedHashMap<>();
        Map<String, ReportRule> graph = new LinkedHashMap<>();
        for (ReportRuleVersion version : pinned) {
            ReportRule rule = version.getRule();
            versions.put(rule.getSlug(), version);
            graph.put(rule.getSlug(), rule);
        }
        // Ordered by the PINNED versions' edges, not the latest versions' — the
        // dependency list is part of what was pinned.
        List<ReportRule> ordered = inDependencyOrder(List.copyOf(graph.values()), graph, versions);
        return evaluate(assessmentId, organizationId, ordered, versions);
    }

    public ReportDryRunResponse run(ReportDryRunRequest request) {
        access.requireActor();

        Map<String, ReportRule> graph = activeBySlug();
        List<ReportRule> selected = select(request, graph);
        // Map.of() = "use each rule's latest", which is the dry run's whole
        // point: it answers what the rules say NOW, not what some computation
        // froze. Ordering can pull in dependencies beyond `selected`, so the
        // version map is built from `ordered`.
        List<ReportRule> ordered = inDependencyOrder(selected, graph, Map.of());
        Map<String, ReportRuleVersion> versions = new LinkedHashMap<>();
        ordered.forEach(r -> r.latestVersion().ifPresent(v -> versions.put(r.getSlug(), v)));

        EvaluatedCohort cohort = evaluate(request.assessmentId(), request.organizationId(),
                ordered, versions);

        int limit = Math.min(request.rowLimit() == null ? DEFAULT_ROW_LIMIT
                : Math.max(0, request.rowLimit()), MAX_ROW_LIMIT);
        List<ReportDryRunResponse.Row> rows = sample(cohort.population(), ordered, limit);

        return new ReportDryRunResponse(request.assessmentId(), cohort.population().size(),
                rows.size(), cohort.outcomes(), rows, cohort.notes());
    }

    /**
     * One evaluated cohort: every respondent, every rule's value on the row.
     *
     * <p>Values live in the row maps under {@code rule:<slug>} — the same key
     * a formula reads a rule by, so a value is addressable identically whether
     * it is being consumed by the next rule or by a template tag.
     */
    public record EvaluatedCohort(
            List<Map<String, Object>> population,
            List<ReportRule> ordered,
            List<ReportDryRunResponse.RuleOutcome> outcomes,
            Set<String> failedSlugs,
            Set<String> unavailableSlugs,
            List<String> notes) {

        /** No rule errored and none needs generation — the delivery precondition. */
        public boolean isClean() {
            return failedSlugs.isEmpty() && unavailableSlugs.isEmpty();
        }

        /** Every rule value for one respondent row, keyed by slug. */
        public Map<String, Object> valuesFor(Map<String, Object> row) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (ReportRule rule : ordered) {
                out.put(rule.getSlug(), row.get(ReportRuleService.RULE_PREFIX + rule.getSlug()));
            }
            return out;
        }
    }

    // ── selection and ordering ────────────────────────────────────────────

    private Map<String, ReportRule> activeBySlug() {
        Map<String, ReportRule> out = new LinkedHashMap<>();
        for (ReportRule rule : rules.findAllWithVersions()) {
            if (ReportRule.STATUS_ACTIVE.equals(rule.getStatus())) {
                out.put(rule.getSlug(), rule);
            }
        }
        return out;
    }

    /**
     * The rules asked for, plus everything they consume.
     *
     * <p>Dependencies are pulled in whether or not they were ticked: a rule run
     * without its inputs computes from missing values, which is worse than not
     * running it.
     */
    private List<ReportRule> select(ReportDryRunRequest request, Map<String, ReportRule> graph) {
        List<ReportRule> roots = new ArrayList<>();
        if (request.ruleIds() == null || request.ruleIds().isEmpty()) {
            graph.values().stream()
                    .filter(r -> request.assessmentId().equals(r.getAssessmentId()))
                    .forEach(roots::add);
        } else {
            Set<Long> wanted = Set.copyOf(request.ruleIds());
            graph.values().stream()
                    .filter(r -> wanted.contains(r.getReportRuleId()))
                    .forEach(roots::add);
        }

        Map<String, ReportRule> closure = new LinkedHashMap<>();
        Deque<ReportRule> queue = new ArrayDeque<>(roots);
        while (!queue.isEmpty()) {
            ReportRule rule = queue.removeFirst();
            if (closure.putIfAbsent(rule.getSlug(), rule) != null) {
                continue;
            }
            for (String slug : edgesOf(rule, Map.of())) {
                ReportRule dep = graph.get(slug);
                if (dep != null) {
                    queue.add(dep);
                }
            }
        }
        return List.copyOf(closure.values());
    }

    /**
     * Depth-first topological order.
     *
     * <p>Cycles are refused at save time, so one cannot normally arrive here.
     * The {@code visiting} set is the backstop that keeps a cycle from becoming
     * a stack overflow if one ever does — an archived rule reappearing, or a
     * row edited outside the service.
     */
    private List<ReportRule> inDependencyOrder(List<ReportRule> selected,
            Map<String, ReportRule> graph, Map<String, ReportRuleVersion> versions) {
        Map<String, ReportRule> wanted = new LinkedHashMap<>();
        selected.forEach(r -> wanted.put(r.getSlug(), r));

        List<ReportRule> ordered = new ArrayList<>();
        Set<String> done = new LinkedHashSet<>();
        Set<String> visiting = new LinkedHashSet<>();
        for (ReportRule rule : selected) {
            visit(rule, wanted, graph, versions, done, visiting, ordered);
        }
        return ordered;
    }

    private void visit(ReportRule rule, Map<String, ReportRule> wanted,
            Map<String, ReportRule> graph, Map<String, ReportRuleVersion> versions,
            Set<String> done, Set<String> visiting, List<ReportRule> ordered) {
        if (done.contains(rule.getSlug()) || !visiting.add(rule.getSlug())) {
            return;
        }
        for (String slug : edgesOf(rule, versions)) {
            ReportRule dep = wanted.getOrDefault(slug, graph.get(slug));
            if (dep != null) {
                visit(dep, wanted, graph, versions, done, visiting, ordered);
            }
        }
        visiting.remove(rule.getSlug());
        if (done.add(rule.getSlug())) {
            ordered.add(rule);
        }
    }

    /**
     * The rules this one consumes, according to the version being RUN.
     *
     * <p>Reads the pinned version's edge list when there is one and only falls
     * back to latest otherwise. A pinned v3 that dropped a dependency its v4
     * reintroduced must order as v3 does.
     */
    private static List<String> edgesOf(ReportRule rule, Map<String, ReportRuleVersion> versions) {
        ReportRuleVersion pinned = versions.get(rule.getSlug());
        if (pinned != null) {
            return ReportRuleService.parseKeys(pinned.getReferencedRuleSlugsJson());
        }
        return rule.latestVersion()
                .map(v -> ReportRuleService.parseKeys(v.getReferencedRuleSlugsJson()))
                .orElseGet(List::of);
    }

    /** The first dependency that produced nothing, or null when all are fine. */
    private static String firstBlockedDependency(ReportRuleVersion version, Set<String> failed,
            Set<String> unavailable) {
        for (String slug : ReportRuleService.parseKeys(version.getReferencedRuleSlugsJson())) {
            if (failed.contains(slug) || unavailable.contains(slug)) {
                return slug;
            }
        }
        return null;
    }

    // ── output ────────────────────────────────────────────────────────────

    private static ReportDryRunResponse.RuleOutcome outcome(ReportRule rule,
            ReportRuleVersion version, String status, String error,
            ReportDryRunResponse.Summary summary) {
        return new ReportDryRunResponse.RuleOutcome(
                rule.getReportRuleId(), rule.getSlug(), rule.getName(), rule.getStage(),
                version.getDefinitionKind(), version.getResultType(), version.isPopulation(),
                status, error, summary);
    }

    /**
     * The cohort view of one rule's output.
     *
     * <p>Numeric and term results are summarised differently because they fail
     * differently: a score is wrong by being out of range, a band is wrong by
     * putting everybody in one bucket.
     */
    private static ReportDryRunResponse.Summary summarise(List<Map<String, Object>> population,
            String key) {
        int nulls = 0;
        List<Double> numbers = new ArrayList<>();
        Map<String, Integer> bands = new LinkedHashMap<>();

        for (Map<String, Object> row : population) {
            Object value = row.get(key);
            if (value == null) {
                nulls++;
            } else if (value instanceof Number number) {
                numbers.add(number.doubleValue());
            } else {
                bands.merge(String.valueOf(value), 1, Integer::sum);
            }
        }

        Double min = null;
        Double max = null;
        Double mean = null;
        if (!numbers.isEmpty()) {
            min = numbers.stream().mapToDouble(Double::doubleValue).min().getAsDouble();
            max = numbers.stream().mapToDouble(Double::doubleValue).max().getAsDouble();
            mean = numbers.stream().mapToDouble(Double::doubleValue).average().getAsDouble();
        }
        return new ReportDryRunResponse.Summary(population.size(), nulls, min, max, mean,
                Map.copyOf(bands));
    }

    private static List<ReportDryRunResponse.Row> sample(List<Map<String, Object>> population,
            List<ReportRule> ordered, int limit) {
        List<ReportDryRunResponse.Row> out = new ArrayList<>();
        for (int i = 0; i < population.size() && i < limit; i++) {
            Map<String, Object> row = population.get(i);
            Map<String, Object> values = new LinkedHashMap<>();
            for (ReportRule rule : ordered) {
                values.put(rule.getSlug(), row.get(ReportRuleService.RULE_PREFIX + rule.getSlug()));
            }
            out.add(new ReportDryRunResponse.Row(row.get("rowId"),
                    label(row), values));
        }
        return out;
    }

    /**
     * Who a row is, for the author reading the table.
     *
     * <p>Names are shown here and stripped everywhere a model or a sandbox can
     * see. The distinction is deliberate: the author is checking their own
     * cohort in their own dashboard and needs to recognise a row; nothing
     * outside this response is entitled to.
     */
    private static String label(Map<String, Object> row) {
        Object name = row.get("core:name");
        Object serial = row.get("core:serialId");
        if (name != null && !String.valueOf(name).isBlank()) {
            return String.valueOf(name);
        }
        return serial == null ? "—" : String.valueOf(serial);
    }
}
