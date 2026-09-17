package com.bodhpsychometric.service.report;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ReportCheckResponse;
import com.bodhpsychometric.dto.ReportComputationForTemplateRequest;
import com.bodhpsychometric.dto.ReportTagAnswerRequest;
import com.bodhpsychometric.dto.ReportComputationRequest;
import com.bodhpsychometric.dto.ReportComputationResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.report.ReportComputation;
import com.bodhpsychometric.model.report.ReportComputationRule;
import com.bodhpsychometric.model.report.ReportComputationTagGuidance;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.report.ReportComputationRepository;
import com.bodhpsychometric.repository.report.ReportComputationTagGuidanceRepository;
import com.bodhpsychometric.repository.report.ReportRuleRepository;
import com.bodhpsychometric.repository.report.ReportRuleVersionRepository;
import com.bodhpsychometric.repository.report.ReportTemplateRepository;
import com.bodhpsychometric.security.RequestActor;

/**
 * Assembling a report computation: pick rules, pick a template, pick
 * respondents, write the guidance — and stop at "ready to send".
 *
 * <p><b>Nothing here calls an AI.</b> No provider has been chosen, so the
 * furthest a computation can travel is
 * {@link ReportComputation#STATUS_READY_FOR_GENERATION}, and the most useful
 * thing this produces is the assembled prompt for a human to read. That is
 * deliberate: the prompt has to be right before the choice of model matters.
 *
 * <p>Two guarantees this service is responsible for, both now explicit
 * requirements rather than engineering preference:
 *
 * <ul>
 *   <li>The set of columns the eventual generated code may read is computed
 *       here, from the pinned rule versions, and is exactly what the sandbox
 *       will be handed. The code never gets database access — it receives the
 *       declared columns and has no other route to anything.</li>
 *   <li>{@code READY_FOR_GENERATION} is not approval. A human approval step
 *       after generation, before any real respondent is touched, remains
 *       mandatory and is not reachable from here.</li>
 * </ul>
 */
@Service
@Transactional
public class ReportComputationService {

    private final ReportComputationRepository computations;
    private final ReportComputationTagGuidanceRepository tagGuidance;
    private final ReportRuleVersionRepository ruleVersions;
    private final ReportTemplateRepository templates;
    private final ReportColumnCatalog columns;
    private final ReportPromptAssembler assembler;
    private final TemplateLint lint;
    private final ReportDryRunService dryRun;
    private final ReportAccess access;
    private final ReportNarrativeService narrative;
    private final ReportRuleRepository rules;
    private final AssessmentRepository assessments;

    public ReportComputationService(ReportComputationRepository computations,
            ReportComputationTagGuidanceRepository tagGuidance,
            ReportRuleVersionRepository ruleVersions,
            ReportTemplateRepository templates,
            ReportColumnCatalog columns,
            ReportPromptAssembler assembler,
            TemplateLint lint,
            ReportDryRunService dryRun,
            ReportAccess access,
            ReportNarrativeService narrative,
            ReportRuleRepository rules,
            AssessmentRepository assessments) {
        this.computations = computations;
        this.tagGuidance = tagGuidance;
        this.ruleVersions = ruleVersions;
        this.templates = templates;
        this.columns = columns;
        this.assembler = assembler;
        this.lint = lint;
        this.dryRun = dryRun;
        this.access = access;
        this.narrative = narrative;
        this.rules = rules;
        this.assessments = assessments;
    }

    // ── reads ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ReportComputationResponse> listAll() {
        access.requireActor();
        // No prompt assembly and no blockers for the list. Both read the
        // dataset — the blockers used to EVALUATE the whole cohort per row,
        // so listing ten computations was ten complete rule runs. A list shows
        // status, mode and counts, none of which needs a respondent.
        return computations.findAllWithRules().stream()
                .map(c -> toResponse(c, null, null))
                .toList();
    }

    @Transactional(readOnly = true)
    public ReportComputationResponse get(Long id) {
        access.requireActor();
        ReportComputation computation = load(id);
        List<ReportComputationTagGuidance> guidance = loadGuidance(id);
        return toResponse(computation, assembler.assemble(computation, guidance),
                check(computation, false).blockers());
    }

    /**
     * The full pre-approval check, cohort evaluation included.
     *
     * <p>On demand, never on a read: the screen calls it after each change and
     * before it enables approve, and approval runs the same method itself.
     */
    @Transactional(readOnly = true)
    public ReportCheckResponse check(Long id) {
        access.requireActor();
        return toCheckResponse(check(load(id), true));
    }

    /** Every computation of one assessment, newest first, with cheap blockers only. */
    @Transactional(readOnly = true)
    public List<ReportComputationResponse> listByAssessment(Long assessmentId) {
        access.requireActor();
        return computations.findByAssessment(assessmentId).stream()
                .map(c -> toResponse(c, null, check(c, false).blockers()))
                .toList();
    }

    /**
     * The one computation for an assessment and a template — found, or created.
     *
     * <p>This is the Setup page's Layout step: pick a published template and
     * the computation behind it exists. Created ones pin every ACTIVE formula
     * rule homed on the assessment at its latest version, which is what the
     * Rules step produced; plain-language rules are left out because a
     * computation that pins one cannot be delivered without a model, and the
     * screen says how many were skipped.
     *
     * <p>An APPROVED one is returned as it is; the screen offers clone-to-edit.
     * An ARCHIVED one is ignored and a fresh draft is made.
     */
    public ReportComputationResponse forTemplate(ReportComputationForTemplateRequest request) {
        RequestActor actor = access.requireAuthor();
        if (!columns.assessmentExists(request.assessmentId())) {
            throw new NotFoundException("Assessment " + request.assessmentId() + " not found");
        }
        ReportTemplate template = templates.findByIdWithBindings(request.reportTemplateId())
                .orElseThrow(() -> new NotFoundException(
                        "Report template " + request.reportTemplateId() + " not found"));

        List<ReportComputation> live = computations.findLiveForTemplate(
                request.assessmentId(), request.reportTemplateId());
        if (!live.isEmpty()) {
            return get(live.get(0).getReportComputationId());
        }

        String assessmentName = assessments.findById(request.assessmentId())
                .map(a -> a.getName()).orElse("Assessment " + request.assessmentId());
        String name = assessmentName + " — " + template.getName();
        if (name.length() > 160) {
            name = name.substring(0, 160);
        }
        String base = slugFor(null, name);
        String slug = base;
        for (int n = 2; computations.existsBySlugIgnoreCase(slug) && n < 100; n++) {
            slug = base.length() > 76 ? base.substring(0, 76) + "-" + n : base + "-" + n;
        }

        ReportComputation computation = new ReportComputation();
        computation.setName(name);
        computation.setSlug(slug);
        computation.setAssessmentId(request.assessmentId());
        computation.setOrganizationId(request.organizationId());
        computation.setTemplate(template);
        computation.setCreatedByUserId(actor.userId());
        computation.setRespondentScope(ReportComputation.SCOPE_ALL_COMPLETED);
        pinLatestExpressionRules(computation);
        carryAnswersFromEarlierVersion(computation, template);

        ReportComputation saved = computations.save(computation);
        return get(saved.getReportComputationId());
    }

    /**
     * Carry the placeholder answers across when a template gains a version.
     *
     * <p>{@code newVersion} on a template writes a NEW row with a new id, so a
     * computation keeps pointing at the version it was approved against — which
     * is the point, and is what makes an issued report still explicable. The
     * cost is that setting up the new version looked like answering nineteen
     * placeholders again from nothing.
     *
     * <p>So a computation created for version <i>n</i> starts from the answers
     * of the newest live computation this assessment has on an EARLIER version
     * of the same template family (matched by name, which is the family's
     * identity — {@code newVersion} copies it and {@code rename} moves every
     * version together). Only tags the new version actually has come across,
     * and a rule slug comes across only if this computation pins it: carrying a
     * slug that resolves to nothing would produce a tag that reports itself as
     * answered and renders blank, which is the failure mode V33's binding copy
     * was written to avoid.
     */
    private void carryAnswersFromEarlierVersion(ReportComputation fresh, ReportTemplate template) {
        Set<String> tags = new LinkedHashSet<>();
        for (ReportTagBinding binding : template.getBindings()) {
            tags.add(binding.getTag());
        }
        if (tags.isEmpty()) {
            return;
        }
        ReportComputation source = computations.findByAssessment(fresh.getAssessmentId()).stream()
                .filter(c -> !ReportComputation.STATUS_ARCHIVED.equals(c.getStatus()))
                .filter(c -> c.getTemplate() != null)
                .filter(c -> c.getTemplate().getName().equalsIgnoreCase(template.getName()))
                .filter(c -> c.getTemplate().getVersion() < template.getVersion())
                .max(Comparator.comparingInt(c -> c.getTemplate().getVersion()))
                .orElse(null);
        if (source == null) {
            return;
        }
        Set<String> pinned = new LinkedHashSet<>();
        for (ReportComputationRule link : fresh.getRules()) {
            pinned.add(link.getRuleVersion().getRule().getSlug());
        }

        int order = 0;
        for (ReportComputationTagGuidance previous : source.getTagGuidance()) {
            if (!tags.contains(previous.getTag())) {
                continue;
            }
            String ruleSlug = pinned.contains(previous.getRuleSlug()) ? previous.getRuleSlug() : null;
            if (ruleSlug == null && trimToNull(previous.getGuidance()) == null) {
                continue;
            }
            ReportComputationTagGuidance copy = new ReportComputationTagGuidance();
            copy.setTag(previous.getTag());
            copy.setRuleSlug(ruleSlug);
            copy.setGuidance(previous.getGuidance());
            copy.setFormat(previous.getFormat());
            copy.setFallbackText(previous.getFallbackText());
            copy.setSortOrder(order++);
            copy.setComputation(fresh);
            fresh.getTagGuidance().add(copy);
        }
    }

    /**
     * Re-pin every ACTIVE formula rule of the assessment at its latest
     * version — what the Setup page does after the Rules step changed.
     *
     * <p>Tag answers survive: they are keyed by tag and rule SLUG, and a slug
     * does not move when a rule gains a version. An answer naming a rule that
     * was archived since is left in place and reported by the check as
     * pointing at a rule this computation does not pin.
     */
    public ReportComputationResponse repinLatest(Long id) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        requireEditable(computation);
        pinLatestExpressionRules(computation);
        computations.save(computation);
        return get(id);
    }

    /**
     * Answer one placeholder on this computation.
     *
     * <p>A VALUE-shaped tag takes a rule slug, which must be pinned here — a
     * tag pointing at a rule nothing computes renders as its fallback, a blank
     * on a delivered report, so it is refused while the author is looking at
     * it. A NARRATIVE tag takes guidance. CORE and LITERAL tags are answered on
     * the template and refused here so the two cannot disagree.
     */
    public ReportComputationResponse answerTag(Long id, String tag, ReportTagAnswerRequest request) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        requireEditable(computation);
        ReportTemplate template = computation.getTemplate();
        if (template == null) {
            throw new IllegalStateException("Choose a template before answering its placeholders.");
        }
        ReportTagBinding binding = template.getBindings().stream()
                .filter(b -> b.getTag().equals(tag))
                .findFirst()
                .orElseThrow(() -> new NotFoundException(
                        "The template \"" + template.getName() + "\" has no placeholder called \""
                                + tag + "\""));

        String ruleSlug = trimToNull(request.ruleSlug());
        String guidance = trimToNull(request.guidance());
        if (binding.isValueShape()) {
            if (ruleSlug == null) {
                throw new IllegalArgumentException("Choose which rule fills ${" + tag + "}");
            }
            List<String> pinned = computation.getRules().stream()
                    .map(r -> r.getRuleVersion().getRule().getSlug()).toList();
            if (!pinned.contains(ruleSlug)) {
                throw new IllegalArgumentException("\"" + ruleSlug + "\" is not pinned on this "
                        + "computation. It produces: " + (pinned.isEmpty()
                                ? "nothing yet — the Rules step has no formula rules for this assessment"
                                : String.join(", ", pinned)));
            }
            guidance = null;
        } else if (binding.isNarrative()) {
            ruleSlug = null;
        } else {
            throw new IllegalArgumentException("${" + tag + "} is answered on the template ("
                    + binding.getBinderType().toLowerCase(Locale.ROOT)
                    + "), not by this computation.");
        }

        ReportComputationTagGuidance row = computation.getTagGuidance().stream()
                .filter(g -> g.getTag().equals(tag))
                .findFirst().orElse(null);
        String format = trimToNull(request.format());
        String fallback = trimToNull(request.fallbackText());
        boolean empty = ruleSlug == null && guidance == null && format == null && fallback == null;
        if (empty) {
            if (row != null) {
                computation.getTagGuidance().remove(row);
            }
        } else {
            if (row == null) {
                row = new ReportComputationTagGuidance();
                row.setTag(tag);
                row.setComputation(computation);
                computation.getTagGuidance().add(row);
            }
            row.setRuleSlug(ruleSlug);
            row.setGuidance(guidance);
            row.setFormat(format);
            row.setFallbackText(fallback);
            row.setSortOrder(binding.getSortOrder());
        }
        computations.save(computation);
        return get(id);
    }

    /** Every ACTIVE formula rule homed on the computation's assessment, at latest. */
    private void pinLatestExpressionRules(ReportComputation computation) {
        List<Long> ids = new ArrayList<>();
        for (ReportRule rule : rules.findAllWithVersions()) {
            if (!ReportRule.STATUS_ACTIVE.equals(rule.getStatus())
                    || !computation.getAssessmentId().equals(rule.getAssessmentId())) {
                continue;
            }
            rule.latestVersion()
                    .filter(ReportRuleVersion::isExpression)
                    .ifPresent(v -> ids.add(v.getReportRuleVersionId()));
        }
        applyRules(computation, ids);
    }

    // ── writes ────────────────────────────────────────────────────────────

    public ReportComputationResponse create(ReportComputationRequest request) {
        RequestActor actor = access.requireAuthor();
        String name = request.name().trim();
        String slug = slugFor(request.slug(), name);
        if (computations.existsBySlugIgnoreCase(slug)) {
            throw new IllegalStateException(
                    "A computation is already referenced as \"" + slug + "\"");
        }
        if (!columns.assessmentExists(request.assessmentId())) {
            throw new NotFoundException("Assessment " + request.assessmentId() + " not found");
        }

        ReportComputation computation = new ReportComputation();
        computation.setSlug(slug);
        computation.setCreatedByUserId(actor.userId());
        apply(computation, request, name);

        ReportComputation saved = computations.save(computation);
        return get(saved.getReportComputationId());
    }

    public ReportComputationResponse update(Long id, ReportComputationRequest request) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        requireEditable(computation);

        String name = request.name().trim();
        String slug = slugFor(request.slug(), name);
        if (computations.existsBySlugIgnoreCaseAndReportComputationIdNot(slug, id)) {
            throw new IllegalStateException(
                    "A computation is already referenced as \"" + slug + "\"");
        }
        if (!columns.assessmentExists(request.assessmentId())) {
            throw new NotFoundException("Assessment " + request.assessmentId() + " not found");
        }
        computation.setSlug(slug);
        apply(computation, request, name);

        computations.save(computation);
        return get(id);
    }

    /**
     * Mark a draft ready to send.
     *
     * <p>Refuses when the assembler reports a blocker — a missing template, no
     * rules, no prompt, or a rule reading a column this assessment does not
     * have. That last one is the important refusal: it is the exact failure a
     * static column list would have let through.
     *
     * <p><b>This is not approval.</b> It says the prompt is complete, nothing
     * more. The mandatory human review happens after generation and before any
     * real respondent is touched.
     */
    public ReportComputationResponse markReady(Long id) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        ReportPromptAssembler.AssembledPrompt prompt =
                assembler.assemble(computation, loadGuidance(id));
        if (!prompt.isReady()) {
            throw new IllegalStateException(String.join(" ", prompt.blockers()));
        }
        computation.setStatus(ReportComputation.STATUS_READY_FOR_GENERATION);
        computations.save(computation);
        return get(id);
    }

    /**
     * Approve a DIRECT computation for delivery — the gate this whole mode
     * hangs on.
     *
     * <p>The build plan's approval gate exists because generated code is
     * untrusted. That reason does not apply here: an expression cannot import,
     * cannot loop and cannot reach the filesystem or the network. <b>A different
     * reason does.</b> A formula can be perfectly valid code and the wrong
     * psychometrics — a band cut written 33 where the workbook says 34 parses,
     * runs, and puts every respondent on the boundary in the wrong band, in
     * every report, silently. Nothing automatic catches that. A human looking at
     * the distribution does.
     *
     * <p>So the machine checks what it can prove and refuses to guess the rest:
     * every rule runnable, the template published and fully bound, every VALUE
     * tag pointing at a rule actually pinned here, and a live evaluation over
     * the real cohort with no rule failing. Then a person presses the button.
     */
    public ReportComputationResponse approve(Long id) {
        RequestActor actor = access.requireAuthor();
        ReportComputation computation = load(id);

        Check check = check(computation, true);
        if (!check.blockers().isEmpty()) {
            throw new IllegalStateException(String.join(" ", check.blockers()));
        }
        computation.setStatus(ReportComputation.STATUS_APPROVED);
        // The record of the one human act in the whole path: who, when, and
        // over how many completed respondents the cohort-relative rules were
        // judged. Printed into every batch's manifest.
        computation.setApprovedByUserId(actor.userId());
        computation.setApprovedAt(OffsetDateTime.now());
        computation.setApprovedCohortSize(check.cohort() == null ? null
                : check.cohort().completedCount());
        computations.save(computation);
        return get(id);
    }

    /**
     * What a check found: the blockers, and the evaluated cohort when the
     * check got as far as evaluating one.
     */
    public record Check(List<String> blockers, ReportDryRunService.EvaluatedCohort cohort) {
    }

    /**
     * Everything standing between this computation and a delivered report.
     *
     * <p>Ordered cheapest first. The cohort evaluation at the end runs every
     * rule over every respondent, so it is taken only when {@code evaluate} is
     * true — on an explicit check and on approve — and never on a plain read.
     */
    @Transactional(readOnly = true)
    public Check check(ReportComputation computation, boolean evaluate) {
        List<String> out = new ArrayList<>();
        Check cheap = new Check(out, null);
        if (!computation.isDirect()) {
            List<String> statements = computation.getRules().stream()
                    .filter(r -> !r.getRuleVersion().isExpression())
                    .map(r -> r.getRuleVersion().getRule().getName())
                    .toList();
            out.add(statements.isEmpty()
                    ? "This computation is set to be generated by a model."
                    : "These rules are written as statements and need a model to run: "
                            + String.join(", ", statements) + ".");
            return cheap;
        }
        if (computation.getRules().isEmpty()) {
            out.add("No rules are pinned to this computation.");
        }

        ReportTemplate template = computation.getTemplate();
        if (template == null) {
            out.add("No template is chosen, so there is nothing to fill in.");
            return cheap;
        }
        if (!ReportTemplate.STATUS_PUBLISHED.equals(template.getStatus())) {
            out.add("The template \"" + template.getName() + "\" is not published yet.");
        }

        // Re-linted here, not trusted from publish time. Publish checks what the
        // rules knew THEN, and these rules have grown — a template published
        // before the unclosed-void and named-entity checks existed was frozen
        // with a fault that only appears when a real report is rendered, which
        // is to say when it is too late to be cheap. Approval is the last gate
        // before documents about real people leave the building.
        lint.check(template.getHtml()).stream()
                .filter(f -> f.severity() == TemplateLint.Severity.ERROR)
                .findFirst()
                .ifPresent(f -> out.add("The template will not render: " + f.message()));

        List<String> pinnedSlugs = computation.getRules().stream()
                .map(r -> r.getRuleVersion().getRule().getSlug())
                .toList();
        Map<String, ReportComputationTagGuidance> answers = new LinkedHashMap<>();
        for (ReportComputationTagGuidance row : computation.getTagGuidance()) {
            answers.put(row.getTag(), row);
        }
        List<String> unbound = new ArrayList<>();
        List<String> unanswered = new ArrayList<>();
        List<String> dangling = new ArrayList<>();
        for (ReportTagBinding binding : template.getBindings()) {
            if (!binding.isBound()) {
                unbound.add(binding.getTag());
                continue;
            }
            if (!binding.isValueShape()) {
                continue;
            }
            // The template says "a value goes here"; THIS computation must say
            // which rule (V33). No answer is a blank on a delivered report.
            ReportComputationTagGuidance answer = answers.get(binding.getTag());
            if (answer == null || !answer.fillsValue()) {
                unanswered.add(binding.getTag());
            } else if (!pinnedSlugs.contains(answer.getRuleSlug())) {
                dangling.add(binding.getTag() + " → " + answer.getRuleSlug());
            }
        }
        if (!unbound.isEmpty()) {
            out.add("These tags have no value behind them: " + String.join(", ", unbound) + ".");
        }
        if (!unanswered.isEmpty()) {
            out.add("These placeholders have no rule chosen yet: "
                    + String.join(", ", unanswered) + ". Choose one on the Layout step.");
        }
        if (!dangling.isEmpty()) {
            out.add("These tags point at rules this computation does not pin: "
                    + String.join(", ", dangling) + ".");
        }

        // The same check one level down, and the one that actually bites.
        //
        // The check above asks whether a TAG points at a pinned rule. This asks
        // whether a pinned RULE's own [rule:...] references are pinned — and
        // nothing else asks it. Delivery evaluates from the pinned versions
        // alone (ReportDryRunService#evaluatePinned), so an unpinned reference
        // is simply absent from the row map, and the evaluator does not treat
        // an absent key as an error: a null operand makes toNum() return NaN,
        // the comparison degrades to comparing strings, and the rule quietly
        // answers something. "" <= "33" is TRUE, so a band whose score never
        // arrived labels every respondent with the lowest band, for everyone,
        // silently. The rule does not fail, so cohort.isClean() passes it too.
        //
        // This is the invariant ReportRulePortabilityResponse#dependencySlugs
        // already states in words — "a dependency left behind is a rule that
        // reads a value nothing computes" — enforced at the one moment it can
        // be enforced, rather than left as advice on the adoption screen.
        List<String> starved = new ArrayList<>();
        for (ReportComputationRule pinned : computation.getRules()) {
            ReportRuleVersion version = pinned.getRuleVersion();
            List<String> missing = ReportRuleService.parseKeys(version.getReferencedRuleSlugsJson())
                    .stream()
                    .filter(slug -> !pinnedSlugs.contains(slug))
                    .toList();
            if (!missing.isEmpty()) {
                starved.add(version.getRule().getName() + " → " + String.join(", ", missing));
            }
        }
        if (!starved.isEmpty()) {
            out.add("These rules read other rules this computation does not pin, so they will "
                    + "run against a missing value: " + String.join("; ", starved)
                    + ". Pin the rules they read, or point them at rules that are pinned.");
        }

        // A narrative tag is answered — a model writes it — but only if there is
        // a model. Checked here rather than at render because discovering it
        // halfway through a batch means half a ZIP and a held-open request,
        // while discovering it at approval costs nothing.
        List<String> narrativeTags = ReportNarrativeService.narrativeTags(template);
        if (!narrativeTags.isEmpty() && !narrative.isAvailable()) {
            out.add("These tags are written by a model: " + String.join(", ", narrativeTags)
                    + ". AI is not configured, so set OPENAI_API_KEY and restart, or bind "
                    + "them to a value or fixed text instead.");
        }
        if (!out.isEmpty() || !evaluate) {
            return cheap;
        }

        // Last and most expensive: does it actually run, on the real cohort?
        ReportDryRunService.EvaluatedCohort cohort = dryRun.evaluatePinned(
                computation.getAssessmentId(), computation.getOrganizationId(),
                computation.getRules().stream().map(ReportComputationRule::getRuleVersion).toList());
        if (!cohort.failedSlugs().isEmpty()) {
            out.add("These rules do not produce a value on this assessment: "
                    + String.join(", ", cohort.failedSlugs()) + ".");
        }
        if (!cohort.tooSmallSlugs().isEmpty()) {
            out.add("These rules compare respondents to the cohort, and only "
                    + cohort.completedCount() + " ha" + (cohort.completedCount() == 1 ? "s" : "ve")
                    + " completed — at least " + dryRun.minCohortSize() + " are needed: "
                    + String.join(", ", cohort.tooSmallSlugs()) + ".");
        }
        if (cohort.completedCount() == 0) {
            out.add("Nobody has completed this assessment yet, so there is nothing to report on.");
        }
        return new Check(out, cohort);
    }

    private ReportCheckResponse toCheckResponse(Check check) {
        ReportDryRunService.EvaluatedCohort cohort = check.cohort();
        return new ReportCheckResponse(
                null,
                List.copyOf(check.blockers()),
                cohort == null ? 0 : cohort.population().size(),
                cohort == null ? 0 : cohort.completedCount(),
                dryRun.minCohortSize(),
                cohort == null ? List.of() : cohort.outcomes(),
                cohort == null ? List.of() : cohort.notes());
    }

    /**
     * Rename a computation, whatever its status.
     *
     * <p>Allowed on an APPROVED one, unlike every other write. What approval
     * freezes is what the computation PRODUCES — the pinned rule versions, the
     * template, the respondent scope — because a report already issued has to
     * stay explicable. A name is none of those. Renaming "NICR" to something a
     * colleague can recognise changes nothing about any number in any report
     * that was ever generated.
     *
     * <p><b>The slug does not move.</b> It is the stable identifier: it is what
     * {@code values.json} records in every batch already delivered, so changing
     * it would orphan the audit trail from the thing it describes. The name is
     * the label; the slug is the identity.
     */
    public ReportComputationResponse rename(Long id, String requested) {
        access.requireAuthor();
        ReportComputation computation = load(id);

        String name = requested == null ? "" : requested.trim();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Give the computation a name");
        }
        if (name.length() > 160) {
            throw new IllegalArgumentException("Name must be 160 characters or fewer");
        }
        computation.setName(name);
        computations.save(computation);
        return get(id);
    }

    /**
     * Copy an approved computation back to a DRAFT that can be changed.
     *
     * <p>This is the operation two error messages have been telling people to
     * perform since approval existed, and it is what makes "approved is frozen"
     * a workable rule rather than a dead end: the frozen one keeps standing
     * behind the reports it produced, and the copy is where the change happens.
     *
     * <p>The pinned rule VERSIONS are copied, not re-resolved to latest. A clone
     * starts as an exact restatement of what was approved, so the first diff
     * anybody sees is the one they make on purpose — re-pointing it at newer
     * rules silently would make the copy a different computation before anyone
     * had touched it.
     */
    public ReportComputationResponse clone(Long id) {
        RequestActor actor = access.requireAuthor();
        ReportComputation source = load(id);

        ReportComputation copy = new ReportComputation();
        copy.setName(uniqueCopyName(source.getName()));
        copy.setSlug(uniqueCopySlug(source.getSlug()));
        copy.setDescription(source.getDescription());
        copy.setAssessmentId(source.getAssessmentId());
        copy.setOrganizationId(source.getOrganizationId());
        copy.setTemplate(source.getTemplate());
        copy.setSourcePrompt(source.getSourcePrompt());
        copy.setRespondentScope(source.getRespondentScope());
        copy.setRespondentIdsJson(source.getRespondentIdsJson());
        copy.setMode(source.getMode());
        copy.setStatus(ReportComputation.STATUS_DRAFT);
        copy.setCreatedByUserId(actor.userId());
        // A copy is unapproved by definition; the provenance stays with the
        // original, which is what the reports it issued point back to.
        copy.setApprovedByUserId(null);
        copy.setApprovedAt(null);
        copy.setApprovedCohortSize(null);

        int order = 0;
        for (ReportComputationRule link : source.getRules()) {
            ReportComputationRule fresh = new ReportComputationRule();
            fresh.setComputation(copy);
            fresh.setRuleVersion(link.getRuleVersion());
            fresh.setSortOrder(order++);
            copy.getRules().add(fresh);
        }

        ReportComputation saved = computations.save(copy);

        // Guidance is a separate table, so it is copied after the parent has an
        // id rather than through the association.
        int guidanceOrder = 0;
        List<ReportComputationTagGuidance> copied = new ArrayList<>();
        for (ReportComputationTagGuidance row : loadGuidance(id)) {
            ReportComputationTagGuidance fresh = new ReportComputationTagGuidance();
            fresh.setComputation(saved);
            fresh.setTag(row.getTag());
            fresh.setGuidance(row.getGuidance());
            fresh.setRuleSlug(row.getRuleSlug());
            fresh.setFormat(row.getFormat());
            fresh.setFallbackText(row.getFallbackText());
            fresh.setSortOrder(guidanceOrder++);
            copied.add(fresh);
        }
        if (!copied.isEmpty()) {
            tagGuidance.saveAll(copied);
        }
        return get(saved.getReportComputationId());
    }

    /** "NICR" -> "NICR (copy)", then "(copy 2)" and so on. */
    private String uniqueCopyName(String base) {
        String candidate = base + " (copy)";
        for (int n = 2; candidate.length() <= 160 && n < 100; n++) {
            if (!computations.existsByNameIgnoreCase(candidate)) {
                return candidate;
            }
            candidate = base + " (copy " + n + ")";
        }
        return candidate.length() > 160 ? candidate.substring(0, 160) : candidate;
    }

    private String uniqueCopySlug(String base) {
        String candidate = base + "-copy";
        for (int n = 2; n < 100; n++) {
            if (!computations.existsBySlugIgnoreCase(candidate)) {
                return candidate;
            }
            candidate = base + "-copy-" + n;
        }
        return candidate;
    }

    public ReportComputationResponse reopen(Long id) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        if (ReportComputation.STATUS_APPROVED.equals(computation.getStatus())) {
            throw new IllegalStateException(
                    "An approved computation cannot be reopened — clone it instead, so the "
                            + "reports already issued from it stay explicable.");
        }
        computation.setStatus(ReportComputation.STATUS_DRAFT);
        computations.save(computation);
        return get(id);
    }

    /**
     * Retire an approved computation.
     *
     * <p>The operation the delete guard has been naming. Archiving rather than
     * deleting outright is the point: reports may have been issued from this
     * one, and the pinned rule versions plus the template are the only record
     * of what those reports were built from. Retiring keeps that record while
     * taking it out of the working list.
     *
     * <p>Reachable from APPROVED and from DRAFT alike — a draft somebody has
     * abandoned is worth putting away too, and refusing that would just send
     * them back to delete.
     */
    public ReportComputationResponse archive(Long id) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        if (ReportComputation.STATUS_ARCHIVED.equals(computation.getStatus())) {
            return get(id);
        }
        computation.setStatus(ReportComputation.STATUS_ARCHIVED);
        computations.save(computation);
        return get(id);
    }

    /**
     * Delete, once nothing is standing behind it.
     *
     * <p>An APPROVED computation is refused because reports may have been
     * issued from it — archive first. An ARCHIVED one is allowed: retiring it
     * and then deleting it is two deliberate acts, which is enough said.
     */
    public void delete(Long id) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        if (ReportComputation.STATUS_APPROVED.equals(computation.getStatus())) {
            throw new IllegalStateException(
                    "An approved computation cannot be deleted — archive it first, so any "
                            + "report already issued from it stays explicable.");
        }
        computations.delete(computation);
    }

    // ── internals ─────────────────────────────────────────────────────────

    private void apply(ReportComputation computation, ReportComputationRequest request,
            String name) {

        computation.setName(name);
        computation.setDescription(trimToNull(request.description()));
        computation.setAssessmentId(request.assessmentId());
        computation.setOrganizationId(request.organizationId());
        computation.setSourcePrompt(trimToNull(request.sourcePrompt()));

        String scope = request.respondentScope() == null || request.respondentScope().isBlank()
                ? ReportComputation.SCOPE_ALL_COMPLETED
                : request.respondentScope().trim();
        if (!ReportComputation.isKnownScope(scope)) {
            throw new IllegalArgumentException("\"" + scope + "\" is not a respondent scope");
        }
        computation.setRespondentScope(scope);

        List<Long> ids = request.respondentIds() == null ? List.of() : request.respondentIds();
        if (ReportComputation.SCOPE_SELECTED.equals(scope) && ids.isEmpty()) {
            throw new IllegalArgumentException(
                    "Choose at least one respondent, or switch to every completed attempt");
        }
        computation.setRespondentIdsJson(ReportComputation.SCOPE_SELECTED.equals(scope)
                ? toJsonNumberArray(ids) : null);

        if (request.reportTemplateId() == null) {
            computation.setTemplate(null);
        } else {
            ReportTemplate template = templates.findByIdWithBindings(request.reportTemplateId())
                    .orElseThrow(() -> new NotFoundException(
                            "Report template " + request.reportTemplateId() + " not found"));
            computation.setTemplate(template);
        }

        applyRules(computation, request.ruleVersionIds());
        applyTagGuidance(computation, request.tagGuidance());
    }

    /**
     * Replace-all: the screen sends the full selection every save.
     *
     * <p><b>Reconciled in place, never cleared and rebuilt.</b> The obvious
     * spelling — {@code clear()} then {@code addAll()} of fresh rows — looks
     * like a replace but is not one: Hibernate orders INSERTs before DELETEs
     * within a flush, so a rule the author KEPT is inserted a second time while
     * the original is still there, and
     * {@code uqRcrComputationRuleVersion} rejects it. The author sees "that
     * change conflicts with existing data" on an edit that conflicted with
     * nothing, and the only saves that work are the ones that happen to keep no
     * rule at all.
     *
     * <p>So: rows that survive are kept and re-ordered, rows that went are
     * removed (orphanRemoval deletes them), and only genuinely new pairs are
     * inserted. No key is ever deleted and re-inserted in the same flush.
     */
    private void applyRules(ReportComputation computation, List<Long> ruleVersionIds) {
        List<Long> ids = ruleVersionIds == null
                ? List.of() : ruleVersionIds.stream().distinct().toList();

        Map<Long, ReportComputationRule> existing = new LinkedHashMap<>();
        for (ReportComputationRule link : computation.getRules()) {
            existing.put(link.getRuleVersion().getReportRuleVersionId(), link);
        }

        computation.getRules().removeIf(
                link -> !ids.contains(link.getRuleVersion().getReportRuleVersionId()));

        int order = 0;
        for (Long versionId : ids) {
            ReportComputationRule link = existing.get(versionId);
            if (link == null) {
                ReportRuleVersion version = ruleVersions.findById(versionId)
                        .orElseThrow(() -> new NotFoundException(
                                "Rule version " + versionId + " not found"));
                link = new ReportComputationRule();
                link.setRuleVersion(version);
                link.setComputation(computation);
                computation.getRules().add(link);
            }
            link.setSortOrder(order++);
        }

        // Mode is DERIVED, never asked. The author does not get to declare that
        // a computation needs no AI — the rules they pinned decide it, and a
        // STATEMENT has no runnable form however anyone labels the computation.
        boolean everyRuleRunnable = computation.getRules().stream()
                .allMatch(l -> l.getRuleVersion().isExpression());
        computation.setMode(everyRuleRunnable
                ? ReportComputation.MODE_DIRECT : ReportComputation.MODE_GENERATED);
    }

    private void applyTagGuidance(ReportComputation computation,
            List<ReportComputationRequest.TagGuidance> requested) {

        List<ReportComputationRequest.TagGuidance> items =
                requested == null ? List.of() : requested;

        // Same reconcile-in-place as applyRules, and for the same reason:
        // uqRctgComputationTag turns a clear-and-rebuild into a duplicate key
        // the moment an author edits one tag's note and leaves the others
        // alone — which is nearly every edit anybody makes on this screen.
        Map<String, String> wanted = new LinkedHashMap<>();
        for (ReportComputationRequest.TagGuidance item : items) {
            if (item.tag() == null || item.tag().isBlank()) {
                continue;
            }
            if (item.guidance() == null || item.guidance().isBlank()) {
                // An empty note is the absence of a note, not an empty row.
                continue;
            }
            wanted.put(item.tag().trim(), item.guidance().trim());
        }

        Map<String, ReportComputationTagGuidance> existing = new LinkedHashMap<>();
        for (ReportComputationTagGuidance row : computation.getTagGuidance()) {
            existing.put(row.getTag(), row);
        }
        // A row that answers a VALUE tag with a rule is not guidance and is
        // not the form's to remove: the form sends guidance only (V33).
        computation.getTagGuidance().removeIf(
                row -> !wanted.containsKey(row.getTag()) && !row.fillsValue());

        int order = 0;
        for (Map.Entry<String, String> entry : wanted.entrySet()) {
            ReportComputationTagGuidance row = existing.get(entry.getKey());
            if (row == null) {
                row = new ReportComputationTagGuidance();
                row.setTag(entry.getKey());
                row.setComputation(computation);
                computation.getTagGuidance().add(row);
            }
            row.setGuidance(entry.getValue());
            row.setSortOrder(order++);
        }
    }

    /**
     * Discard the stored narrative prose for one computation.
     *
     * <p>Allowed on an APPROVED computation, unlike every other write, and the
     * reasoning is the same as {@code rename}: approval freezes what the
     * computation MEANS — the pinned rule versions, the template, the scope —
     * and none of those move here. Every number in every report stays exactly
     * what it was; only the wording is written again, from the same values,
     * under the same guidance.
     */
    public int clearNarratives(Long id) {
        access.requireAuthor();
        load(id); // 404 rather than a cheerful "0 cleared" for an id that is not there.
        return narrative.clear(id);
    }

    private void requireEditable(ReportComputation computation) {
        if (ReportComputation.STATUS_APPROVED.equals(computation.getStatus())) {
            throw new IllegalStateException(
                    "An approved computation is frozen. Clone it to make changes.");
        }
        if (ReportComputation.STATUS_ARCHIVED.equals(computation.getStatus())) {
            throw new IllegalStateException("This computation is archived.");
        }
    }

    private ReportComputation load(Long id) {
        return computations.findByIdWithRules(id)
                .orElseThrow(() -> new NotFoundException("Computation " + id + " not found"));
    }

    private List<ReportComputationTagGuidance> loadGuidance(Long id) {
        return tagGuidance.findByComputationReportComputationIdOrderBySortOrderAsc(id);
    }

    private ReportComputationResponse toResponse(ReportComputation c,
            ReportPromptAssembler.AssembledPrompt prompt, List<String> blockers) {

        List<ReportComputationResponse.SelectedRule> rules = c.getRules().stream()
                .sorted(java.util.Comparator.comparingInt(ReportComputationRule::getSortOrder))
                .map(link -> {
                    ReportRuleVersion v = link.getRuleVersion();
                    return new ReportComputationResponse.SelectedRule(
                            v.getReportRuleVersionId(),
                            v.getRule().getReportRuleId(),
                            v.getRule().getName(),
                            v.getRule().getSlug(),
                            v.getVersion(),
                            v.getDefinitionKind(),
                            v.getResultType(),
                            v.isPopulation(),
                            ReportRuleService.parseKeys(v.getReferencedKeysJson()),
                            link.getSortOrder());
                })
                .toList();

        List<ReportComputationResponse.TagGuidance> guidance =
                c.getReportComputationId() == null ? List.of()
                        : loadGuidance(c.getReportComputationId()).stream()
                                .map(g -> new ReportComputationResponse.TagGuidance(
                                        g.getTag(), g.getGuidance(), g.getRuleSlug(),
                                        g.getFormat(), g.getFallbackText(), g.getSortOrder()))
                                .toList();

        return new ReportComputationResponse(
                c.getReportComputationId(),
                c.getName(),
                c.getSlug(),
                c.getDescription(),
                c.getAssessmentId(),
                c.getOrganizationId(),
                c.getTemplate() == null ? null : c.getTemplate().getReportTemplateId(),
                ReportComputationResponse.templateNameOf(c),
                c.getStatus(),
                c.getMode(),
                blockers,
                c.getSourcePrompt(),
                c.getRespondentScope(),
                parseNumbers(c.getRespondentIdsJson()),
                rules,
                guidance,
                prompt == null ? null : new ReportComputationResponse.PromptPreview(
                        prompt.isReady(),
                        prompt.prompt(),
                        prompt.declaredKeys(),
                        prompt.expectedTags(),
                        prompt.blockers(),
                        prompt.warnings()),
                ReportNarrativeService.narrativeTags(c.getTemplate()),
                narrative.isAvailable(),
                c.getApprovedByUserId(),
                c.getApprovedAt(),
                c.getApprovedCohortSize(),
                c.getCreatedAt(),
                c.getUpdatedAt());
    }

    private static String slugFor(String supplied, String name) {
        String base = (supplied == null || supplied.isBlank()) ? name : supplied;
        String slug = base.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.isEmpty()) {
            throw new IllegalArgumentException(
                    "Give it a name containing at least one letter or number");
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

    private static String toJsonNumberArray(List<Long> values) {
        return "[" + values.stream().map(String::valueOf)
                .collect(java.util.stream.Collectors.joining(",")) + "]";
    }

    private static List<Long> parseNumbers(String json) {
        List<Long> out = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return out;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\d+").matcher(json);
        while (m.find()) {
            out.add(Long.valueOf(m.group()));
        }
        return out;
    }
}
