package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsExprResponse;
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
    private final ReportAccess access;

    public ReportRuleService(ReportRuleRepository rules,
            ReportComputationRepository computations,
            ReportColumnCatalog columns,
            ExpressionService expressions,
            ReportAccess access) {
        this.rules = rules;
        this.computations = computations;
        this.columns = columns;
        this.expressions = expressions;
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
            Long organizationId) {
        access.requireActor();
        Set<String> available = assessmentId == null
                ? Set.of()
                : columns.columnKeys(assessmentId, organizationId);
        return strictValidate(expression == null ? "" : expression, available);
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
        return parseKeys(latest.getReferencedKeysJson()).stream().allMatch(available::contains);
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
        rule.setCreatedByUserId(actor.userId());
        rule.addVersion(buildVersion(request, 1, actor));

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
        rule.addVersion(buildVersion(request, rule.nextVersionNumber(), actor));

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
            RequestActor actor) {

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

            Set<String> available =
                    columns.columnKeys(request.assessmentId(), request.organizationId());
            if (available.isEmpty()) {
                throw new IllegalArgumentException(
                        "This assessment exposes no columns yet — nothing has been placed in "
                                + "its questionnaire, so there is nothing for a formula to read.");
            }
            // strictValidate, not the raw validator: an empty or partial column
            // set must refuse unknown columns, never wave them through.
            DsExprResponse checked = strictValidate(expr, available);
            if (!checked.ok()) {
                throw new IllegalArgumentException(String.join(" ", checked.errors()));
            }

            version.setExpression(expr);
            version.setResultType(mapResultType(checked.resultType(), request.resultType()));
            version.setReferencedKeysJson(toJsonArray(checked.referencedColumns()));
            // SERVER means the formula needs every row to answer — a population
            // function. Derived, never asked, so it cannot disagree with the
            // formula it describes.
            version.setPopulation(ExpressionService.SERVER.equals(checked.evalTarget()));
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
            version.setPopulation(false);
        }
        return version;
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
                .map(v -> ReportRuleResponse.RuleVersion.from(v, parseKeys(v.getReferencedKeysJson())))
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
