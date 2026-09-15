package com.bodhpsychometric.service.report;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsExprResponse;
import com.bodhpsychometric.dto.ReportRulePortabilityResponse;
import com.bodhpsychometric.dto.ReportRuleRequest;
import com.bodhpsychometric.dto.ReportRuleResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.repository.report.ReportComputationRepository;
import com.bodhpsychometric.repository.report.ReportRuleRepository;
import com.bodhpsychometric.security.RequestActor;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;

/**
 * The rules library: named, reusable scoring and interpretation logic.
 *
 * <p>Two things here are load-bearing and worth stating plainly.
 *
 * <p><b>1. An expression is validated against the LIVE column list of a REAL
 * assessment.</b> Not a hardcoded list, not a cached one, not "any key that
 * looks like an MQT". Different assessments expose different MQ/MQT sets —
 * score columns come from the questions actually placed in the questionnaire —
 * so a rule checked against nothing, or against a stale snapshot, can look
 * perfectly valid and then score every respondent null the first time it runs
 * somewhere else. See {@link ReportColumnCatalog}.
 *
 * <p><b>2. Saving never mutates.</b> Every save writes a new immutable
 * {@link ReportRuleVersion}, and a computation pins the version it selected. A
 * rule improved next March therefore cannot change what a report approved last
 * September meant.
 */
@Service
@Transactional
public class ReportRuleService {

    private final ReportRuleRepository rules;
    private final ReportComputationRepository computations;
    private final ReportColumnCatalog columns;
    private final ExpressionService expressions;
    private final ReportShapeProbe shapes;
    private final ReportAccess access;

    public ReportRuleService(ReportRuleRepository rules,
            ReportComputationRepository computations,
            ReportColumnCatalog columns,
            ExpressionService expressions,
            ReportShapeProbe shapes,
            ReportAccess access) {
        this.rules = rules;
        this.computations = computations;
        this.columns = columns;
        this.expressions = expressions;
        this.shapes = shapes;
        this.access = access;
    }

    // ── reads ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ReportRuleResponse> listAll() {
        access.requireActor();
        return rules.findAllWithVersions().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ReportRuleResponse get(Long id) {
        access.requireActor();
        return toResponse(load(id));
    }

    /**
     * The MQ/MQT picker's source. Live, per assessment.
     *
     * <p>An assessment with no columns is a real answer (nothing placed yet),
     * so it returns an empty list; an assessment that does not exist is a 404.
     */
    @Transactional(readOnly = true)
    public List<ReportColumnCatalog.ReportColumn> columnsFor(Long assessmentId, Long organizationId) {
        access.requireActor();
        if (!columns.assessmentExists(assessmentId)) {
            throw new NotFoundException("Assessment " + assessmentId + " not found");
        }
        return columns.columnsFor(assessmentId, organizationId);
    }

    /**
     * Live expression checking for the editor.
     *
     * <p><b>Always HTTP 200, even when the formula is broken</b> — mirroring
     * Data Studio, because a half-typed formula is a normal state and an error
     * status would make the editor flash red on every keystroke.
     */
    @Transactional(readOnly = true)
    public DsExprResponse validateExpression(String expression, Long assessmentId,
            Long organizationId, Long editingRuleId) {
        return validateExpression(expression, assessmentId, organizationId, editingRuleId, Set.of());
    }

    /**
     * The same check, with some plain-language rules treated as though they
     * were already formulae.
     *
     * <p>This exists for translating a WHOLE workbook at once, where the
     * dependency order works against the checker. A composite score reads the
     * three factor scores; if those three are still STATEMENTs at the moment
     * the composite is checked, a perfectly correct formula is rejected for
     * depending on plain language. Every cross-referencing rule in a real sheet
     * would fail that way - which is most of the interesting ones.
     *
     * <p>{@code pendingExpressionSlugs} names the rules the caller is about to
     * turn into formulae in the same batch. It relaxes ONLY the
     * plain-language-dependency refusal: unknown columns, invented functions,
     * self-references and cycles are all still refused exactly as before, and
     * the ordinary save path re-runs the strict check with an empty set, so
     * nothing accepted here can be saved until its dependencies really are
     * formulae.
     */
    public DsExprResponse validateExpression(String expression, Long assessmentId,
            Long organizationId, Long editingRuleId, Set<String> pendingExpressionSlugs) {
        access.requireActor();
        Set<String> columnKeys = assessmentId == null
                ? Set.of()
                : columns.columnKeys(assessmentId, organizationId);

        // The live check MUST offer the same names the save accepts.
        //
        // It used to pass columns only, so `[rule:some-slug]` — which save
        // accepts, and which the sidebar inserts for you — came back as
        // "Unknown column" while Create rule would have succeeded. An author
        // reading a red box under a correct formula has no way to know the
        // checker is the thing that is wrong, so they rewrite a working rule.
        Map<String, ReportRule> graph = columnKeys.isEmpty() ? Map.of() : activeRulesBySlug();
        String ownSlug = ownSlugOf(editingRuleId, graph);
        Set<String> available = new LinkedHashSet<>(columnKeys);
        for (String slug : graph.keySet()) {
            if (!slug.equalsIgnoreCase(ownSlug)) {
                available.add(RULE_PREFIX + slug);
            }
        }

        DsExprResponse checked = strictValidate(expression == null ? "" : expression, available);
        if (!checked.ok()) {
            return checked;
        }

        // Same two refusals the save applies, so a formula that checks out here
        // really does save. A self-reference and a plain-language dependency are
        // both accepted by the grammar and rejected by the rule layer.
        List<String> errors = new ArrayList<>();
        for (String key : checked.referencedColumns()) {
            if (!key.startsWith(RULE_PREFIX)) {
                continue;
            }
            String dep = key.substring(RULE_PREFIX.length());
            if (dep.equalsIgnoreCase(ownSlug)) {
                errors.add("A rule cannot read itself.");
                continue;
            }
            ReportRule target = graph.get(dep);
            ReportRuleVersion latest = target == null ? null : target.latestVersion().orElse(null);
            boolean pending = pendingExpressionSlugs.stream().anyMatch(dep::equalsIgnoreCase);
            if (latest != null && !latest.isExpression() && !pending) {
                errors.add("\"" + dep + "\" is a plain-language rule, so it has no value a "
                        + "formula can read. Reference it from the guidance prompt instead.");
            }
        }
        if (!errors.isEmpty()) {
            return new DsExprResponse(false, checked.evalTarget(), checked.resultType(),
                    List.copyOf(errors), checked.referencedColumns(), checked.functions());
        }

        // Valid, and possibly still wrong. A threshold no respondent can reach
        // is the one defect this layer can PROVE without asking a human, and
        // the one the author is least likely to spot: see RuleRangeLint.
        return checked.withWarnings(rangeWarnings(expression, assessmentId, organizationId));
    }

    /**
     * Thresholds the instrument cannot produce.
     *
     * <p>Advisory, never a refusal. Two reasons, and the second is the one that
     * settles it: a maximum is read from the questionnaire as it stands today,
     * so a rule written ahead of the items that will feed it would be blocked
     * for being early rather than wrong; and an author knows things about their
     * own instrument that a probe does not. Warn, and let them decide.
     *
     * <p>Silent when anything needed is missing — no assessment chosen, an
     * unparseable formula (the caller has already reported that as an error),
     * or a questionnaire with nothing placed. A lint with nothing to go on says
     * nothing rather than guessing.
     */
    private List<String> rangeWarnings(String expression, Long assessmentId, Long organizationId) {
        if (assessmentId == null || expression == null || expression.isBlank()) {
            return List.of();
        }
        Map<String, Double> maxima = RuleRangeLint.maximaOf(shapes.shapeOf(assessmentId));
        if (maxima.isEmpty()) {
            return List.of();
        }
        Map<String, String> labels = new LinkedHashMap<>();
        for (ReportColumnCatalog.ReportColumn column
                : columns.columnsFor(assessmentId, organizationId)) {
            labels.put(column.key(), column.label());
        }
        try {
            return RuleRangeLint.check(expressions.parse(expression), maxima, labels);
        } catch (RuntimeException e) {
            return List.of();
        }
    }

    /** The slug of the rule being edited, so the checker can exclude it. */
    private String ownSlugOf(Long editingRuleId, Map<String, ReportRule> graph) {
        if (editingRuleId == null) {
            return null;
        }
        return graph.values().stream()
                .filter(r -> editingRuleId.equals(r.getReportRuleId()))
                .map(ReportRule::getSlug)
                .findFirst()
                .orElse(null);
    }

    /**
     * {@link ExpressionService#validate} with its permissive fallback removed.
     *
     * <p><b>This is the hole it closes.</b> That method documents, and
     * implements, "an empty {@code availableColumns} means do not check column
     * names" — correct for a Data Studio sheet that has not been bound to an
     * assessment yet, and exactly wrong for a report rule. It means:
     *
     * <ul>
     *   <li>validating with no assessment chosen would pass <em>any</em> column
     *       name, telling the author their formula is fine when nothing has
     *       been checked at all; and</li>
     *   <li>more seriously, an assessment whose questionnaire has nothing
     *       placed yields an EMPTY key set, so a save against it would accept
     *       {@code [mqt:99999]} — a rule that looks valid and scores every
     *       respondent null the moment it runs.</li>
     * </ul>
     *
     * <p>So every referenced column is re-checked here against the set the
     * caller actually supplied, and an empty set means <b>nothing is valid</b>
     * rather than everything.
     */
    private DsExprResponse strictValidate(String expression, Set<String> available) {
        DsExprResponse base = expressions.validate(expression, available);

        List<String> unknown = base.referencedColumns().stream()
                .filter(key -> !available.contains(key))
                .toList();
        if (unknown.isEmpty()) {
            return base;
        }

        List<String> errors = new ArrayList<>(base.errors());
        for (String key : unknown) {
            // ExpressionService already reports these when `available` is
            // non-empty; only add what it left out, so the author never sees
            // the same column named twice.
            boolean alreadyReported = errors.stream().anyMatch(e -> e.contains(key));
            if (!alreadyReported) {
                errors.add(available.isEmpty()
                        ? "Choose an assessment first — \"" + key + "\" cannot be checked "
                                + "until it is known which MQ/MQT columns exist."
                        : "Unknown column: " + key);
            }
        }
        return new DsExprResponse(false, base.evalTarget(), base.resultType(),
                List.copyOf(errors), base.referencedColumns(), base.functions());
    }

    /**
     * Which assessments this rule could run on today.
     *
     * <p>Computed on demand, never stored: an assessment's columns change when
     * questions are unplaced, so a cached answer would go stale silently — and
     * silently is the whole problem.
     */
    @Transactional(readOnly = true)
    public boolean canRunOn(Long ruleId, Long assessmentId, Long organizationId) {
        access.requireActor();
        ReportRule rule = load(ruleId);
        ReportRuleVersion latest = rule.latestVersion().orElse(null);
        if (latest == null || !latest.isExpression()) {
            // A plain-language rule has no columns to check. It travels.
            return true;
        }
        Set<String> available = columns.columnKeys(assessmentId, organizationId);
        return transitiveColumnKeys(rule, activeRulesBySlug()).stream().allMatch(available::contains);
    }

    /**
     * Every library rule, judged against one assessment.
     *
     * <p>This is what the setup page's picker renders. Computed on every call
     * and never stored, for the reason {@link ReportColumnCatalog} gives at
     * length: an assessment's columns change when questions are unplaced, so a
     * cached verdict says "portable" about a rule that stopped being portable
     * an hour ago, and says it silently.
     *
     * <p>Rules already homed on this assessment are included — the author still
     * needs to see them, and a rule can stop fitting its own assessment when
     * the questionnaire changes underneath it.
     */
    @Transactional(readOnly = true)
    public List<ReportRulePortabilityResponse> portabilityFor(Long assessmentId,
            Long organizationId) {
        access.requireActor();
        if (!columns.assessmentExists(assessmentId)) {
            throw new NotFoundException("Assessment " + assessmentId + " not found");
        }
        Set<String> available = columns.columnKeys(assessmentId, organizationId);
        Map<String, ReportRule> graph = activeRulesBySlug();
        Map<String, ReportShapeProbe.MqtShape> here = shapes.shapeOf(assessmentId);

        // One probe per source assessment, not one per rule: a library of forty
        // rules written against three assessments is three probes, and each is
        // a scoring-plan read.
        Map<Long, Map<String, ReportShapeProbe.MqtShape>> there = new LinkedHashMap<>();

        List<ReportRulePortabilityResponse> out = new ArrayList<>();
        for (ReportRule rule : graph.values()) {
            ReportRuleVersion latest = rule.latestVersion().orElse(null);
            List<String> deps = dependencyClosure(rule, graph);

            if (latest == null || !latest.isExpression()) {
                // Plain language names no columns, so nothing can be missing.
                // It travels; whether it MEANS the same thing elsewhere is a
                // judgement no check can make, and pretending otherwise would
                // be worse than saying nothing.
                out.add(verdict(rule, latest, ReportRulePortabilityResponse.PORTABLE,
                        List.of(), List.of(), deps));
                continue;
            }

            Set<String> needed = transitiveColumnKeys(rule, graph);
            List<String> missing = needed.stream().filter(k -> !available.contains(k)).sorted().toList();
            if (!missing.isEmpty()) {
                out.add(verdict(rule, latest, ReportRulePortabilityResponse.BLOCKED,
                        missing, List.of(), deps));
                continue;
            }

            Long from = latest.getValidatedAssessmentId();
            List<String> warnings = List.of();
            if (from != null && !from.equals(assessmentId)) {
                Map<String, ReportShapeProbe.MqtShape> origin =
                        there.computeIfAbsent(from, shapes::shapeOf);
                warnings = shapeWarnings(needed, origin, here);
            }
            out.add(verdict(rule, latest,
                    warnings.isEmpty() ? ReportRulePortabilityResponse.PORTABLE
                            : ReportRulePortabilityResponse.SHAPE_MISMATCH,
                    List.of(), warnings, deps));
        }
        return out;
    }

    /**
     * The sentence an author needs in order to decide, rather than a flag.
     *
     * <p>"Internal Drive is scored by 8 questions here (max 40) but by 4 where
     * this rule was written (max 20)" tells them their band cuts are wrong.
     * "SHAPE_MISMATCH" tells them nothing.
     */
    private static List<String> shapeWarnings(Set<String> keys,
            Map<String, ReportShapeProbe.MqtShape> origin,
            Map<String, ReportShapeProbe.MqtShape> here) {

        List<String> warnings = new ArrayList<>();
        for (String key : keys) {
            ReportShapeProbe.MqtShape was = origin.get(key);
            ReportShapeProbe.MqtShape is = here.get(key);
            if (was == null || is == null) {
                continue;   // not a scored column, or absent from one side
            }
            if (was.questions() == is.questions() && was.maxPossible() == is.maxPossible()) {
                continue;
            }
            warnings.add(key + " is scored by " + is.questions() + " question"
                    + (is.questions() == 1 ? "" : "s") + " here (max " + trim(is.maxPossible())
                    + ") but by " + was.questions() + " (max " + trim(was.maxPossible())
                    + ") where this rule was written — any cut point in it means "
                    + "something different on this assessment.");
        }
        return warnings;
    }

    private static String trim(double value) {
        return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
    }

    private ReportRulePortabilityResponse verdict(ReportRule rule, ReportRuleVersion latest,
            String verdict, List<String> missing, List<String> warnings, List<String> deps) {
        return new ReportRulePortabilityResponse(
                rule.getReportRuleId(), rule.getName(), rule.getSlug(),
                rule.getStage(), rule.getStepOrder(),
                latest == null ? null : latest.getDefinitionKind(),
                rule.getAssessmentId(),
                latest == null ? null : latest.getValidatedAssessmentId(),
                latest != null && latest.isPopulation(),
                verdict, missing, warnings, deps);
    }

    /** Every rule this one reaches, transitively. Excludes itself. */
    List<String> dependencyClosure(ReportRule rule, Map<String, ReportRule> graph) {
        Set<String> seen = new LinkedHashSet<>();
        Deque<String> queue = new ArrayDeque<>(edgesOf(rule));
        while (!queue.isEmpty()) {
            String slug = queue.removeFirst();
            if (!seen.add(slug)) {
                continue;
            }
            ReportRule dep = graph.get(slug);
            if (dep != null) {
                queue.addAll(edgesOf(dep));
            }
        }
        return List.copyOf(seen);
    }

    // ── writes ────────────────────────────────────────────────────────────

    public ReportRuleResponse create(ReportRuleRequest request) {
        RequestActor actor = access.requireAuthor();
        String name = request.name().trim();
        String slug = slugFor(request.slug(), name);

        if (rules.existsByNameIgnoreCase(name)) {
            throw new IllegalStateException("A rule called \"" + name + "\" already exists");
        }
        if (rules.existsBySlugIgnoreCase(slug)) {
            throw new IllegalStateException("A rule is already referenced as \"" + slug + "\"");
        }

        ReportRule rule = new ReportRule();
        rule.setName(name);
        rule.setSlug(slug);
        rule.setDescription(trimToNull(request.description()));
        rule.setAssessmentId(request.assessmentId());
        rule.setStage(stageOf(request));
        rule.setStepOrder(request.stepOrder() == null ? 0 : request.stepOrder());
        rule.setCreatedByUserId(actor.userId());
        rule.addVersion(buildVersion(request, 1, actor, slug));

        return toResponse(rules.save(rule));
    }

    /** Saving an edit writes version N+1. The old version is never touched. */
    public ReportRuleResponse update(Long id, ReportRuleRequest request) {
        RequestActor actor = access.requireAuthor();
        ReportRule rule = load(id);
        String name = request.name().trim();
        String slug = slugFor(request.slug(), name);

        if (rules.existsByNameIgnoreCaseAndReportRuleIdNot(name, id)) {
            throw new IllegalStateException("A rule called \"" + name + "\" already exists");
        }
        if (rules.existsBySlugIgnoreCaseAndReportRuleIdNot(slug, id)) {
            throw new IllegalStateException("A rule is already referenced as \"" + slug + "\"");
        }

        rule.setName(name);
        rule.setSlug(slug);
        rule.setDescription(trimToNull(request.description()));
        rule.setAssessmentId(request.assessmentId());
        rule.setStage(stageOf(request));
        rule.setStepOrder(request.stepOrder() == null ? rule.getStepOrder() : request.stepOrder());
        rule.addVersion(buildVersion(request, rule.nextVersionNumber(), actor, slug));

        return toResponse(rules.save(rule));
    }

    /**
     * Deleting a rule that a computation depends on is refused with a 409.
     *
     * <p>Pre-checked rather than caught: catching a DataIntegrityViolation
     * inside {@code @Transactional} marks the transaction rollback-only, so the
     * 409 would still 500 at commit.
     */
    public void delete(Long id) {
        access.requireAuthor();
        ReportRule rule = load(id);
        long uses = computations.countUsagesOfRule(id);
        if (uses > 0) {
            throw new IllegalStateException("This rule is used by " + uses
                    + " computation" + (uses == 1 ? "" : "s") + " and cannot be deleted. "
                    + "Archive it instead — the versions they pinned must stay readable.");
        }
        rules.delete(rule);
    }

    public ReportRuleResponse archive(Long id) {
        access.requireAuthor();
        ReportRule rule = load(id);
        rule.setStatus(ReportRule.STATUS_ARCHIVED);
        return toResponse(rules.save(rule));
    }

    // ── internals ─────────────────────────────────────────────────────────

    /**
     * Build one immutable version, validating whichever definition kind it is.
     *
     * <p>For an EXPRESSION this is where a column that does not exist on the
     * chosen assessment is refused — the single check that stops a rule being
     * valid-looking and wrong.
     */
    private ReportRuleVersion buildVersion(ReportRuleRequest request, int versionNumber,
            RequestActor actor, String ownSlug) {

        String kind = request.definitionKind() == null ? "" : request.definitionKind().trim();
        if (!ReportRuleVersion.isKnownKind(kind)) {
            throw new IllegalArgumentException(
                    "A rule is either an EXPRESSION or a STATEMENT, not \"" + kind + "\"");
        }

        ReportRuleVersion version = new ReportRuleVersion();
        version.setVersion(versionNumber);
        version.setDefinitionKind(kind);
        version.setNotes(trimToNull(request.notes()));
        version.setCreatedByUserId(actor.userId());

        if (ReportRuleVersion.KIND_EXPRESSION.equals(kind)) {
            String expr = request.expression() == null ? "" : request.expression().trim();
            if (expr.isEmpty()) {
                throw new IllegalArgumentException("Type the formula for this rule");
            }
            if (request.assessmentId() == null) {
                throw new IllegalArgumentException(
                        "Choose the assessment this formula is written against. Its MQ/MQT "
                                + "columns are what the formula is checked against, and "
                                + "different assessments expose different ones.");
            }
            if (!columns.assessmentExists(request.assessmentId())) {
                throw new NotFoundException("Assessment " + request.assessmentId() + " not found");
            }

            Set<String> columnKeys =
                    columns.columnKeys(request.assessmentId(), request.organizationId());
            if (columnKeys.isEmpty()) {
                throw new IllegalArgumentException(
                        "This assessment exposes no columns yet — nothing has been placed in "
                                + "its questionnaire, so there is nothing for a formula to read.");
            }

            // The rules a formula may consume, offered alongside the real
            // columns. `[rule:some-slug]` needs no grammar change — the lexer
            // already reads anything bracketed as a reference — so supplying
            // these keys is the whole mechanism, and a slug naming no ACTIVE
            // rule is refused exactly the way an invented MQT is.
            Map<String, ReportRule> graph = activeRulesBySlug();
            Set<String> available = new LinkedHashSet<>(columnKeys);
            for (String slug : graph.keySet()) {
                if (!slug.equalsIgnoreCase(ownSlug)) {
                    available.add(RULE_PREFIX + slug);
                }
            }

            // strictValidate, not the raw validator: an empty or partial column
            // set must refuse unknown columns, never wave them through.
            DsExprResponse checked = strictValidate(expr, available);
            if (!checked.ok()) {
                throw new IllegalArgumentException(String.join(" ", checked.errors()));
            }

            List<String> referencedColumns = new ArrayList<>();
            List<String> referencedRules = new ArrayList<>();
            for (String key : checked.referencedColumns()) {
                if (key.startsWith(RULE_PREFIX)) {
                    referencedRules.add(key.substring(RULE_PREFIX.length()));
                } else {
                    referencedColumns.add(key);
                }
            }

            // A plain-language rule has no value a formula can read. Left
            // unchecked it would evaluate to null for every respondent and the
            // report would be quietly blank rather than obviously broken.
            for (String dep : referencedRules) {
                ReportRule target = graph.get(dep);
                ReportRuleVersion depLatest =
                        target == null ? null : target.latestVersion().orElse(null);
                if (depLatest != null && !depLatest.isExpression()) {
                    throw new IllegalArgumentException("\"" + dep + "\" is a plain-language rule, "
                            + "so it has no value a formula can read. Reference it from the "
                            + "guidance prompt instead.");
                }
            }

            assertAcyclic(ownSlug, referencedRules, graph);

            version.setExpression(expr);
            version.setResultType(mapResultType(checked.resultType(), request.resultType()));
            version.setReferencedKeysJson(toJsonArray(referencedColumns));
            version.setReferencedRuleSlugsJson(toJsonArray(referencedRules));
            // SERVER means the formula needs every row to answer — a population
            // function. Derived, never asked, so it cannot disagree with the
            // formula it describes.
            //
            // Propagated through the DAG as well: a band rule reading a
            // cohort-relative composite is itself cohort-relative, and it is
            // this flag that arms the min_cohort_size guard. Missing that would
            // let a z-score-derived band print for a cohort of one, where sd is
            // 0 and every z-score is exactly 0 — indistinguishable from
            // perfectly average.
            version.setPopulation(
                    checked.functions().stream().anyMatch(POPULATION_FUNCTIONS::contains)
                            || dependsOnPopulation(referencedRules, graph));
            version.setValidatedAssessmentId(request.assessmentId());
        } else {
            String statement = request.statementText() == null ? "" : request.statementText().trim();
            if (statement.isEmpty()) {
                throw new IllegalArgumentException("Write out what this rule says");
            }
            version.setStatementText(statement);
            // A plain-language rule declares its own result type; there is
            // nothing to infer it from.
            String declared = request.resultType() == null ? null : request.resultType().trim();
            if (declared != null && !declared.isEmpty()
                    && !ReportRuleVersion.isKnownResultType(declared)) {
                throw new IllegalArgumentException("\"" + declared + "\" is not a result type");
            }
            version.setResultType(declared == null || declared.isEmpty()
                    ? ReportRuleVersion.RESULT_TEXT : declared);
            version.setReferencedKeysJson("[]");
            version.setReferencedRuleSlugsJson("[]");
            version.setPopulation(false);
        }
        return version;
    }

    // ── the rule DAG ──────────────────────────────────────────────────────

    /**
     * How one rule refers to another inside a formula: {@code [rule:my-slug]}.
     *
     * <p>Not a new grammar. The expression lexer already treats anything in
     * brackets as a reference — which is why real columns are written
     * {@code [mqt:14]}, since '-' is subtraction and ':' separates the family
     * prefix — so this resolves by being ADDED to the available key set, and by
     * nothing else.
     */
    static final String RULE_PREFIX = "rule:";

    /**
     * The functions whose answer genuinely depends on the whole cohort.
     *
     * <p>Stated here rather than reused from {@code ExpressionService.SERVER_FUNCS},
     * and the difference between the two lists is the point: that one includes
     * {@code NORMBAND}, because Data Studio uses CLIENT/SERVER as a hint about
     * where a column can be computed, and it prefers to compute banding on the
     * server. {@code NORMBAND} is nonetheless <b>row-local</b> — its evaluator
     * reads cut points and the current row and nothing else.
     *
     * <p>{@code SUM} is absent from both lists and that is not an oversight:
     * {@code SUM(a, b, c)} adds up one respondent's own columns. A composite
     * score is not cohort-relative and must not arm the guard below.
     *
     * <p>Borrowing that list would therefore mark <b>every band rule</b>
     * population, and {@code is_population} is not a latency hint here: it arms
     * the minimum-cohort guard, which suppresses a value and prints "norm group
     * too small" instead. Bands would stop printing for small cohorts for no
     * reason at all. Two lists, because the two flags answer different
     * questions.
     */
    private static final Set<String> POPULATION_FUNCTIONS = Set.of(
            "AVERAGE", "COUNT", "AVERAGEIF", "COUNTIF",
            "PERCENTILE", "PERCENTRANK", "ZSCORE", "RANK");

    /** ACTIVE rules by slug. Archived ones are deliberately unreferenceable. */
    private Map<String, ReportRule> activeRulesBySlug() {
        Map<String, ReportRule> out = new LinkedHashMap<>();
        for (ReportRule rule : rules.findAllWithVersions()) {
            if (ReportRule.STATUS_ACTIVE.equals(rule.getStatus())) {
                out.put(rule.getSlug(), rule);
            }
        }
        return out;
    }

    private static List<String> edgesOf(ReportRule rule) {
        return rule.latestVersion()
                .map(v -> parseKeys(v.getReferencedRuleSlugsJson()))
                .orElseGet(List::of);
    }

    /**
     * Refuse a save that would make the pipeline circular.
     *
     * <p>A cycle is not a slow query here, it is a rule with no defined value:
     * a band that reads a composite that reads the band back has no order it
     * could be evaluated in. Caught at save, when there is one author to tell,
     * rather than at generation, when there is a failed batch to explain.
     *
     * <p>Self-reference is covered by the same walk — {@code ownSlug} is
     * excluded from the available keys, so it cannot normally be typed, and
     * this is the backstop for a rename that would introduce one.
     */
    private static void assertAcyclic(String ownSlug, List<String> newEdges,
            Map<String, ReportRule> graph) {

        Map<String, List<String>> edges = new LinkedHashMap<>();
        graph.forEach((slug, rule) -> edges.put(slug, edgesOf(rule)));
        edges.put(ownSlug, newEdges);   // the version being saved, not the stored one

        Deque<String> path = new ArrayDeque<>();
        Set<String> done = new LinkedHashSet<>();
        if (hasCycle(ownSlug, edges, path, done)) {
            List<String> loop = new ArrayList<>(path);
            loop.add(ownSlug);
            throw new IllegalArgumentException(
                    "This would make the rules refer to each other in a circle: "
                            + String.join(" → ", loop)
                            + ". A rule cannot depend on its own result.");
        }
    }

    private static boolean hasCycle(String slug, Map<String, List<String>> edges,
            Deque<String> path, Set<String> done) {
        if (path.contains(slug)) {
            return true;
        }
        if (!done.add(slug)) {
            return false;
        }
        path.addLast(slug);
        for (String next : edges.getOrDefault(slug, List.of())) {
            if (hasCycle(next, edges, path, done)) {
                return true;
            }
        }
        path.removeLast();
        return false;
    }

    /** True when anything in the transitive closure is cohort-relative. */
    private static boolean dependsOnPopulation(List<String> edges, Map<String, ReportRule> graph) {
        Set<String> seen = new LinkedHashSet<>();
        Deque<String> queue = new ArrayDeque<>(edges);
        while (!queue.isEmpty()) {
            String slug = queue.removeFirst();
            if (!seen.add(slug)) {
                continue;
            }
            ReportRule rule = graph.get(slug);
            if (rule == null) {
                continue;
            }
            ReportRuleVersion latest = rule.latestVersion().orElse(null);
            if (latest != null && latest.isPopulation()) {
                return true;
            }
            queue.addAll(edgesOf(rule));
        }
        return false;
    }

    /**
     * Every column the rule needs, its dependencies included.
     *
     * <p>Portability is asked of the whole chain, not of one formula: a band
     * rule referencing nothing but {@code [rule:composite]} has no columns of
     * its own and would otherwise look portable everywhere, including onto an
     * assessment that cannot compute the composite it rests on.
     */
    Set<String> transitiveColumnKeys(ReportRule rule, Map<String, ReportRule> graph) {
        Set<String> keys = new LinkedHashSet<>();
        Set<String> seen = new LinkedHashSet<>();
        Deque<ReportRule> queue = new ArrayDeque<>();
        queue.add(rule);
        while (!queue.isEmpty()) {
            ReportRule current = queue.removeFirst();
            if (!seen.add(current.getSlug())) {
                continue;
            }
            ReportRuleVersion latest = current.latestVersion().orElse(null);
            if (latest == null) {
                continue;
            }
            keys.addAll(parseKeys(latest.getReferencedKeysJson()));
            for (String slug : parseKeys(latest.getReferencedRuleSlugsJson())) {
                ReportRule dep = graph.get(slug);
                if (dep != null) {
                    queue.add(dep);
                }
            }
        }
        return keys;
    }

    private static String stageOf(ReportRuleRequest request) {
        String stage = request.stage() == null ? "" : request.stage().trim().toUpperCase(Locale.ROOT);
        if (stage.isEmpty()) {
            // The library page edits rules without knowing steps exist.
            return ReportRule.STAGE_SCORE;
        }
        if (!ReportRule.isKnownStage(stage)) {
            throw new IllegalArgumentException("\"" + stage + "\" is not an authoring step");
        }
        return stage;
    }

    /** The parser's type wins; the author's declaration is a fallback. */
    private static String mapResultType(String parsed, String declared) {
        if (parsed != null) {
            if (parsed.equalsIgnoreCase("number")) {
                return ReportRuleVersion.RESULT_NUMBER;
            }
            if (parsed.equalsIgnoreCase("string")) {
                return ReportRuleVersion.RESULT_TERM;
            }
        }
        if (declared != null && ReportRuleVersion.isKnownResultType(declared.trim())) {
            return declared.trim();
        }
        return ReportRuleVersion.RESULT_NUMBER;
    }

    private ReportRuleResponse toResponse(ReportRule rule) {
        List<ReportRuleResponse.RuleVersion> versions = rule.getVersions().stream()
                .sorted(java.util.Comparator.comparingInt(ReportRuleVersion::getVersion))
                .map(v -> ReportRuleResponse.RuleVersion.from(v,
                        parseKeys(v.getReferencedKeysJson()),
                        parseKeys(v.getReferencedRuleSlugsJson())))
                .toList();
        return ReportRuleResponse.from(rule, versions);
    }

    private ReportRule load(Long id) {
        return rules.findByIdWithVersions(id)
                .orElseThrow(() -> new NotFoundException("Rule " + id + " not found"));
    }

    /**
     * A stable, readable reference derived from the name when the author does
     * not supply one — this is the thing a guidance prompt says out loud.
     */
    private static String slugFor(String supplied, String name) {
        String base = (supplied == null || supplied.isBlank()) ? name : supplied;
        String slug = base.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.isEmpty()) {
            throw new IllegalArgumentException(
                    "Give the rule a name containing at least one letter or number");
        }
        return slug.length() > 80 ? slug.substring(0, 80) : slug;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Column keys come from the parser's own character class, so there is
     * nothing to escape and no reason to pull a JSON mapper into this path.
     */
    static String toJsonArray(List<String> values) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(values.get(i)).append('"');
        }
        return sb.append(']').toString();
    }

    static List<String> parseKeys(String json) {
        List<String> out = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return out;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"([^\"]+)\"").matcher(json);
        while (m.find()) {
            out.add(m.group(1));
        }
        return out;
    }
}
