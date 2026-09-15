package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsExprResponse;
import com.bodhpsychometric.dto.RuleTranslationRequest;
import com.bodhpsychometric.dto.RuleTranslationResponse;
import com.bodhpsychometric.dto.RuleTranslationResponse.Proposal;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.repository.report.ReportRuleRepository;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Plain-language rules into formulae, proposed and never saved.
 *
 * <h2>Why this is safe enough to offer a practitioner</h2>
 *
 * The model's output passes three gates before a person sees it, and a fourth
 * before it takes effect:
 *
 * <ol>
 *   <li>The grammar has a <b>closed function whitelist enforced at parse
 *       time</b>, so an invented {@code CONCAT()} is rejected outright — the
 *       single most likely mistake costs nothing.
 *   <li>Column names are checked against the columns that assessment actually
 *       exposes, so a plausible-looking {@code [mqt:99]} cannot survive.
 *   <li>Rule references are checked against real slugs, and cycles refused.
 *   <li>Nothing is written here at all. A proposal becomes a rule only when a
 *       human accepts it, through the ordinary save path, which re-runs all of
 *       the above.
 * </ol>
 *
 * <p>The consequence worth stating plainly: this feature cannot put a wrong
 * number in a report by itself. It can waste a reviewer's time with a formula
 * that parses and means the wrong thing, which is why the source text travels
 * beside every proposal and why {@code confident: false} is a first-class
 * answer rather than a failure.
 *
 * <h2>What leaves the building</h2>
 *
 * Rule text and column NAMES. No respondent rows, and no identity columns —
 * the line {@link ReportColumnCatalog#IDENTITY_KEYS} already draws for the
 * report generator. A translation is a question about wording; nobody's score
 * is needed to answer it.
 */
@Service
public class RuleTranslationService {

    private static final Logger log = LoggerFactory.getLogger(RuleTranslationService.class);

    @Autowired private OpenAiClient openAi;
    @Autowired private ReportRuleRepository rules;
    @Autowired private ReportRuleService ruleService;
    @Autowired private ReportColumnCatalog columns;
    @Autowired private ReportAccess access;
    @Autowired private ObjectMapper json;

    public boolean isAvailable() {
        return openAi.isAvailable();
    }

    /* ===================== the call ===================== */

    @Transactional(readOnly = true)
    public RuleTranslationResponse propose(RuleTranslationRequest request) {
        access.requireAuthor();

        List<ReportRule> targets = rules.findAllById(request.ruleIds()).stream()
                .filter(r -> r.latestVersion().map(v -> !v.isExpression()).orElse(false))
                .sorted((a, b) -> Integer.compare(a.getStepOrder(), b.getStepOrder()))
                .toList();

        if (targets.isEmpty()) {
            throw new IllegalStateException(
                    "None of those rules are plain-language rules waiting to be translated.");
        }

        // Every rule in this batch is about to become a formula, so none of
        // them counts as a plain-language dependency while the batch is being
        // checked. Without this a composite score reading three factor scores
        // is rejected for depending on plain language - which is most of a real
        // workbook, since that is exactly how scoring sheets are written.
        Set<String> pending = targets.stream().map(ReportRule::getSlug)
                .collect(java.util.stream.Collectors.toSet());

        String catalog = catalogPrompt(request);
        String answer = openAi.completeAsJson(systemPrompt(), catalog + rulesPrompt(targets));
        Map<String, Attempt> attempts = readAttempts(answer);

        List<Proposal> proposals = new ArrayList<>();
        List<ReportRule> retry = new ArrayList<>();
        Map<Long, String> complaints = new LinkedHashMap<>();

        for (ReportRule rule : targets) {
            Attempt attempt = attempts.get(rule.getSlug());
            DsExprResponse verdict = validate(attempt, rule, request, pending);
            if (verdict != null && !verdict.ok()) {
                retry.add(rule);
                complaints.put(rule.getReportRuleId(), String.join(" ", verdict.errors()));
            }
            proposals.add(proposalOf(rule, attempt, verdict));
        }

        // ONE retry, and only for what failed, with the validator's own words
        // fed back. A model that misnames a column usually fixes it when told
        // the exact complaint; one that cannot is not going to be talked round
        // by a third attempt, and each round costs the reviewer waiting time.
        if (!retry.isEmpty()) {
            proposals = retryFailures(request, targets, retry, complaints, catalog, proposals,
                    pending);
        }

        return new RuleTranslationResponse(openAi.model(), proposals);
    }

    private List<Proposal> retryFailures(RuleTranslationRequest request, List<ReportRule> all,
            List<ReportRule> failed, Map<Long, String> complaints, String catalog,
            List<Proposal> first, Set<String> pending) {
        StringBuilder correction = new StringBuilder(catalog);
        correction.append("\n\nThese translations were REJECTED by the validator. ")
                .append("Fix each one using the exact complaint given. ")
                .append("If you cannot fix it with the columns and rules listed above, ")
                .append("return an empty expression and say why in note.\n\n");
        for (ReportRule rule : failed) {
            correction.append("slug: ").append(rule.getSlug()).append('\n')
                    .append("original text: ").append(sourceText(rule)).append('\n')
                    .append("validator said: ").append(complaints.get(rule.getReportRuleId()))
                    .append("\n\n");
        }

        Map<String, Attempt> second;
        try {
            second = readAttempts(openAi.completeAsJson(systemPrompt(), correction.toString()));
        } catch (RuntimeException e) {
            // The first pass is still worth returning — a failed retry must not
            // discard the proposals that already validated.
            log.warn("Translation retry failed; keeping the first pass", e);
            return first;
        }

        List<Proposal> merged = new ArrayList<>();
        for (Proposal p : first) {
            if (p.ok()) {
                merged.add(p);
                continue;
            }
            ReportRule rule = all.stream()
                    .filter(r -> r.getReportRuleId().equals(p.reportRuleId()))
                    .findFirst().orElse(null);
            Attempt attempt = rule == null ? null : second.get(rule.getSlug());
            if (rule == null || attempt == null) {
                merged.add(p);
                continue;
            }
            DsExprResponse verdict = validate(attempt, rule, request, pending);
            merged.add(proposalOf(rule, attempt, verdict));
        }
        return merged;
    }

    /* ===================== validation ===================== */

    /**
     * The proposal through the same checker the save path uses.
     *
     * <p>{@code editingRuleId} is passed so the checker treats a self-reference
     * as the mistake it is, exactly as saving would — without it the live
     * verdict and the save could disagree, and the disagreement would surface
     * as a rule that reviewed clean and then refused to save.
     */
    private DsExprResponse validate(Attempt attempt, ReportRule rule,
            RuleTranslationRequest request, Set<String> pending) {
        if (attempt == null || attempt.expression == null || attempt.expression.isBlank()) {
            return null;
        }
        try {
            return ruleService.validateExpression(attempt.expression, request.assessmentId(),
                    request.organizationId(), rule.getReportRuleId(), pending);
        } catch (RuntimeException e) {
            return new DsExprResponse(false, ExpressionService.CLIENT, "number",
                    List.of(e.getMessage() == null ? "Could not check this formula." : e.getMessage()),
                    List.of(), List.of());
        }
    }

    private static Proposal proposalOf(ReportRule rule, Attempt attempt, DsExprResponse verdict) {
        String expression = attempt == null ? null : attempt.expression;
        boolean ok = verdict != null && verdict.ok();
        List<String> errors = verdict == null
                ? List.of(expression == null || expression.isBlank()
                        ? "The model did not produce a formula for this rule."
                        : "This formula was not checked.")
                : verdict.errors();
        // A warned proposal is never presented as confident, whatever the model
        // said. "I am sure" and "no respondent can ever match this" cannot both
        // be true, and the tick is what carries someone past reading the note.
        List<String> warnings = verdict == null ? List.of() : verdict.warnings();
        return new Proposal(
                rule.getReportRuleId(),
                rule.getName(),
                sourceText(rule),
                expression,
                verdict == null ? null : verdict.resultType(),
                ok,
                attempt != null && attempt.confident && ok && warnings.isEmpty(),
                errors,
                attempt == null ? null : attempt.note,
                warnings);
    }

    private static String sourceText(ReportRule rule) {
        return statementOf(rule);
    }

    /* ===================== the prompt ===================== */

    private static String systemPrompt() {
        return """
                You translate psychometric scoring rules into a small formula \
                language. You do not invent syntax, functions, columns or rule \
                names: you may use ONLY the names listed in the message.

                Answer with a JSON object of the form:
                {"translations":[{"slug":"...","expression":"...","confident":true,\
                "note":"..."}]}

                Rules of the language:
                - IF(condition, thenValue, elseValue) takes exactly three arguments.
                - AND and OR are INFIX keywords, not functions: write "a >= 1 AND b <= 2".
                  AND(a, b) is a syntax error.
                - NORMBAND(value, cut1, label1, ..., finalLabel) bands a number. Its cut \
                  points are EXCLUSIVE at the bottom: a workbook band written as \
                  "<= 33 / 34-47 / >= 48" is NORMBAND(x, 34, 'low', 48, 'mid', 'high') - \
                  use the number the band STARTS at, never the one it ends at.
                - FIRST(a, b, ..., fallback) returns the first argument that is not empty. \
                  Use it when several rules compete to fill one placeholder; argument \
                  order is priority order.
                - Text literals use single quotes.
                - A rule that should produce nothing when it does not apply must return \
                  '' (empty text), not a message.

                Hard requirements:
                - Use ONLY functions from the list given. Any other name is rejected.
                - Use ONLY column keys and rule references given. NEVER guess a column \
                  key or invent a [rule:...] slug.
                - Rules are listed in two groups. Reference a rule of THIS assessment \
                  whenever one computes the quantity. A rule of another assessment may \
                  carry almost the same name and mean the same thing for a different \
                  workbook: choosing it produces a formula that validates and then reads \
                  a value this report never computes. If only the other group has it, \
                  reference it and say so in note.
                - When the text names a quantity that another rule already computes - a \
                  composite, a factor score, a band - reference that rule with \
                  [rule:slug]. Do NOT rebuild it from columns, and do NOT substitute a \
                  column that merely sounds similar. Match on the 'writes' name or the \
                  'says' description, not on a column label. If the quantity is named \
                  but you cannot tell WHICH rule computes it, that is a case for an \
                  empty expression and confident: false - say which candidates you \
                  could not choose between.
                - If a rule mentions data that is not in the column list - a timestamp, \
                  an item the catalog does not contain, a previous attempt - do NOT \
                  approximate it. Return an empty expression, set confident to false, \
                  and say in note exactly what was missing.
                - A wrong formula is far worse than no formula. Guessing is the one \
                  thing you must not do.
                """;
    }

    /**
     * The vocabulary: functions, columns, and the other rules by slug.
     *
     * <p>Identity columns are left out. They are the one thing a scoring rule
     * has no legitimate use for, and the exclusion is the same one the report
     * generator already makes.
     */
    private String catalogPrompt(RuleTranslationRequest request) {
        StringBuilder sb = new StringBuilder();

        sb.append("FUNCTIONS (the complete list; anything else is rejected):\n");
        sb.append(String.join(", ", ExpressionService.functionNames())).append("\n\n");

        sb.append("COLUMNS (write them as shown, in square brackets):\n");
        for (ReportColumnCatalog.ReportColumn column
                : columns.columnsFor(request.assessmentId(), request.organizationId())) {
            if (ReportColumnCatalog.isIdentityColumn(column.key())) {
                continue;
            }
            sb.append("  [").append(column.key()).append("]  ")
                    .append(column.label()).append("  (").append(column.type()).append(")\n");
        }

        sb.append("\nRULES you may reference as [rule:slug]. ")
                .append("'writes' is the name the workbook gives this rule's output - ")
                .append("when another rule's text mentions that name, reference this rule. ")
                .append("'says' is what the workbook said the rule does - when another ")
                .append("rule's text names that quantity in any wording, reference this ")
                .append("rule rather than rebuilding it from columns.\n");

        // Split by home assessment, and the split is the whole point.
        //
        // The list used to be flat, and a library that holds two workbooks
        // scoring the same construct holds two rules called "Internal Drive" —
        // one per assessment, differing only by slug prefix. A flat list gives
        // the model no way to tell them apart, and it picked the shorter,
        // older slug: every band and profile rule of the newer workbook was
        // translated to read the OLDER workbook's scores. The formulae
        // validated (the rule graph is library-wide, by design, because a rule
        // may legitimately be adopted across assessments) and then evaluated
        // against a value nothing on this computation produces.
        //
        // Cross-assessment references stay offered rather than filtered out —
        // removing them would break portability, which is a real feature. They
        // are labelled instead, and the instruction below makes the home
        // assessment's rule the default. Both halves matter: the model needs to
        // see the foreign rule to adopt one deliberately, and needs to be told
        // not to reach for it by accident.
        List<ReportRule> active = rules.findAllWithVersions().stream()
                .filter(r -> ReportRule.STATUS_ACTIVE.equals(r.getStatus()))
                .toList();
        List<ReportRule> here = active.stream()
                .filter(r -> Objects.equals(r.getAssessmentId(), request.assessmentId()))
                .toList();
        List<ReportRule> elsewhere = active.stream()
                .filter(r -> !Objects.equals(r.getAssessmentId(), request.assessmentId()))
                .toList();

        sb.append("\nRules of THIS assessment - prefer these always:\n");
        if (here.isEmpty()) {
            sb.append("  (none yet)\n");
        }
        here.forEach(rule -> appendRule(sb, rule));

        if (!elsewhere.isEmpty()) {
            sb.append("\nRules of OTHER assessments, sharing this library. A rule above and a ")
                    .append("rule here may have almost the same name and compute the same ")
                    .append("construct for a DIFFERENT workbook. Reference one of these ONLY ")
                    .append("when no rule of this assessment computes the quantity - never ")
                    .append("because the name matched more closely:\n");
            elsewhere.forEach(rule -> appendRule(sb, rule));
        }
        return sb.toString();
    }

    /** One catalog line: slug, name, and whatever the workbook said about it. */
    private static void appendRule(StringBuilder sb, ReportRule rule) {
        sb.append("  [rule:").append(rule.getSlug()).append("]  ").append(rule.getName());
        String writes = writesFor(rule);
        if (writes != null) {
            sb.append("  writes: ").append(writes);
        }
        String says = statementOf(rule);
        if (!says.isBlank()) {
            sb.append("  says: ").append(oneLine(says));
        }
        sb.append('\n');
    }

    /**
     * The most recent version that still SAYS something, which is not
     * necessarily the most recent version.
     *
     * <p>Translating a rule replaces its statement with a formula, and the new
     * version's {@code statementText} is null. Reading only
     * {@link ReportRule#latestVersion()} therefore made a rule anonymous the
     * moment it was translated — and a translated rule is exactly the kind
     * another rule wants to reference.
     *
     * <p>The workbook's own case: 3.4 wrote {@code AD_composite = ID + ST + AE}
     * in v1, became a formula in v3, and 4.1's {@code IF AD_composite >= 48}
     * was then translated against a catalog in which nothing was called
     * AD_composite any more. The model did the only thing left to it and
     * reached for a raw column whose label said "total".
     */
    private static String statementOf(ReportRule rule) {
        return rule.getVersions().stream()
                .sorted(Comparator.comparingInt(ReportRuleVersion::getVersion).reversed())
                .map(ReportRuleVersion::getStatementText)
                .filter(text -> text != null && !text.isBlank())
                .findFirst()
                .orElse("");
    }

    /**
     * The name this rule assigns to, from the newest version that states one.
     *
     * <p>Walked separately from {@link #statementOf} rather than parsed out of
     * it: a later edit can restate a rule in prose that names nothing
     * ("Sum of total score of Internal drive + ...") while an earlier version
     * still carries the token every other rule refers to it by. Taking the
     * newest STATEMENT and finding no name in it would lose the name that is
     * still in use.
     */
    private static String writesFor(ReportRule rule) {
        return rule.getVersions().stream()
                .sorted(Comparator.comparingInt(ReportRuleVersion::getVersion).reversed())
                .map(v -> ScoringSheetParser.writesTo(v.getStatementText()))
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    /** One prompt line per rule: newlines folded, long prose clipped. */
    private static String oneLine(String text) {
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() <= 200 ? flat : flat.substring(0, 197).trim() + "...";
    }

    private static String rulesPrompt(List<ReportRule> targets) {
        StringBuilder sb = new StringBuilder("\nTRANSLATE THESE RULES:\n\n");
        for (ReportRule rule : targets) {
            sb.append("slug: ").append(rule.getSlug()).append('\n')
                    .append("name: ").append(rule.getName()).append('\n')
                    .append("step: ").append(rule.getStage()).append('\n')
                    .append("text: ").append(sourceText(rule)).append("\n\n");
        }
        return sb.toString();
    }

    /* ===================== reading the answer ===================== */

    /** One translation as the model returned it, before anybody believes it. */
    private static final class Attempt {
        String expression;
        String note;
        boolean confident;
    }

    private Map<String, Attempt> readAttempts(String answer) {
        Map<String, Attempt> out = new LinkedHashMap<>();
        JsonNode root;
        try {
            root = json.readTree(answer);
        } catch (RuntimeException e) {
            throw new IllegalStateException(
                    "The model's answer was not valid JSON, so nothing could be read from it.", e);
        }
        for (JsonNode node : root.path("translations")) {
            String slug = node.path("slug").asString("");
            if (slug.isBlank()) {
                continue;
            }
            Attempt attempt = new Attempt();
            attempt.expression = node.path("expression").asString("").trim();
            attempt.note = node.path("note").asString("").trim();
            attempt.confident = node.path("confident").asBoolean(false);
            out.put(slug, attempt);
        }
        return out;
    }
}
