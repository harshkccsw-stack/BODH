package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ReportComputationRequest;
import com.bodhpsychometric.dto.ReportComputationResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.report.ReportComputation;
import com.bodhpsychometric.model.report.ReportComputationRule;
import com.bodhpsychometric.model.report.ReportComputationTagGuidance;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.repository.report.ReportComputationRepository;
import com.bodhpsychometric.repository.report.ReportComputationTagGuidanceRepository;
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
    private final ReportDryRunService dryRun;
    private final ReportAccess access;

    public ReportComputationService(ReportComputationRepository computations,
            ReportComputationTagGuidanceRepository tagGuidance,
            ReportRuleVersionRepository ruleVersions,
            ReportTemplateRepository templates,
            ReportColumnCatalog columns,
            ReportPromptAssembler assembler,
            ReportDryRunService dryRun,
            ReportAccess access) {
        this.computations = computations;
        this.tagGuidance = tagGuidance;
        this.ruleVersions = ruleVersions;
        this.templates = templates;
        this.columns = columns;
        this.assembler = assembler;
        this.dryRun = dryRun;
        this.access = access;
    }

    // ── reads ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ReportComputationResponse> listAll() {
        access.requireActor();
        // No prompt assembly for the list: it reads the whole dataset per row.
        return computations.findAllWithRules().stream()
                .map(c -> toResponse(c, null))
                .toList();
    }

    @Transactional(readOnly = true)
    public ReportComputationResponse get(Long id) {
        access.requireActor();
        ReportComputation computation = load(id);
        List<ReportComputationTagGuidance> guidance = loadGuidance(id);
        return toResponse(computation, assembler.assemble(computation, guidance));
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
        access.requireAuthor();
        ReportComputation computation = load(id);

        List<String> blockers = directBlockers(computation);
        if (!blockers.isEmpty()) {
            throw new IllegalStateException(String.join(" ", blockers));
        }
        computation.setStatus(ReportComputation.STATUS_APPROVED);
        computations.save(computation);
        return get(id);
    }

    /**
     * Everything standing between this computation and a delivered report.
     *
     * <p>Returned on every read, not only on the approve attempt, so the screen
     * can show the author what is left instead of making them press a button to
     * find out. Ordered cheapest check first — the cohort evaluation at the end
     * runs every rule over every respondent.
     */
    @Transactional(readOnly = true)
    public List<String> directBlockers(ReportComputation computation) {
        List<String> out = new ArrayList<>();
        if (!computation.isDirect()) {
            List<String> statements = computation.getRules().stream()
                    .filter(r -> !r.getRuleVersion().isExpression())
                    .map(r -> r.getRuleVersion().getRule().getName())
                    .toList();
            out.add(statements.isEmpty()
                    ? "This computation is set to be generated by a model."
                    : "These rules are written as statements and need a model to run: "
                            + String.join(", ", statements) + ".");
            return out;
        }
        if (computation.getRules().isEmpty()) {
            out.add("No rules are pinned to this computation.");
        }

        ReportTemplate template = computation.getTemplate();
        if (template == null) {
            out.add("No template is chosen, so there is nothing to fill in.");
            return out;
        }
        if (!ReportTemplate.STATUS_PUBLISHED.equals(template.getStatus())) {
            out.add("The template \"" + template.getName() + "\" is not published yet.");
        }

        List<String> pinnedSlugs = computation.getRules().stream()
                .map(r -> r.getRuleVersion().getRule().getSlug())
                .toList();
        List<String> unbound = new ArrayList<>();
        List<String> dangling = new ArrayList<>();
        for (ReportTagBinding binding : template.getBindings()) {
            if (!binding.isBound()) {
                unbound.add(binding.getTag());
            } else if (ReportTagBinding.TYPE_COMPUTED.equals(binding.getBinderType())) {
                // COMPUTED says "something fills this" without saying what. It
                // is an authoring placeholder and cannot resolve to anything.
                unbound.add(binding.getTag());
            } else if (binding.isResolvableValue()
                    && !pinnedSlugs.contains(binding.getOutputKey())) {
                dangling.add(binding.getTag() + " → " + binding.getOutputKey());
            }
        }
        if (!unbound.isEmpty()) {
            out.add("These tags have no value behind them: " + String.join(", ", unbound) + ".");
        }
        if (!dangling.isEmpty()) {
            out.add("These tags point at rules this computation does not pin: "
                    + String.join(", ", dangling) + ".");
        }
        if (!out.isEmpty()) {
            return out;
        }

        // Last and most expensive: does it actually run, on the real cohort?
        ReportDryRunService.EvaluatedCohort cohort = dryRun.evaluatePinned(
                computation.getAssessmentId(), computation.getOrganizationId(),
                computation.getRules().stream().map(ReportComputationRule::getRuleVersion).toList());
        if (!cohort.isClean()) {
            String failing = String.join(", ", cohort.failedSlugs());
            out.add("These rules do not produce a value on this assessment: " + failing + ".");
        }
        if (cohort.population().isEmpty()) {
            out.add("Nobody has completed this assessment yet, so there is nothing to report on.");
        }
        return out;
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

    public void delete(Long id) {
        access.requireAuthor();
        ReportComputation computation = load(id);
        if (ReportComputation.STATUS_APPROVED.equals(computation.getStatus())) {
            throw new IllegalStateException(
                    "An approved computation cannot be deleted. Archive it instead.");
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

    /** Replace-all: the screen sends the full selection every save. */
    private void applyRules(ReportComputation computation, List<Long> ruleVersionIds) {
        List<Long> ids = ruleVersionIds == null ? List.of() : ruleVersionIds;
        List<ReportComputationRule> links = new ArrayList<>(ids.size());
        int order = 0;
        for (Long versionId : ids.stream().distinct().toList()) {
            ReportRuleVersion version = ruleVersions.findById(versionId)
                    .orElseThrow(() -> new NotFoundException(
                            "Rule version " + versionId + " not found"));
            ReportComputationRule link = new ReportComputationRule();
            link.setRuleVersion(version);
            link.setComputation(computation);
            link.setSortOrder(order++);
            links.add(link);
        }
        computation.getRules().clear();
        computation.getRules().addAll(links);

        // Mode is DERIVED, never asked. The author does not get to declare that
        // a computation needs no AI — the rules they pinned decide it, and a
        // STATEMENT has no runnable form however anyone labels the computation.
        boolean everyRuleRunnable = links.stream()
                .allMatch(l -> l.getRuleVersion().isExpression());
        computation.setMode(everyRuleRunnable
                ? ReportComputation.MODE_DIRECT : ReportComputation.MODE_GENERATED);
    }

    private void applyTagGuidance(ReportComputation computation,
            List<ReportComputationRequest.TagGuidance> requested) {

        List<ReportComputationRequest.TagGuidance> items =
                requested == null ? List.of() : requested;
        List<ReportComputationTagGuidance> rows = new ArrayList<>(items.size());
        int order = 0;
        for (ReportComputationRequest.TagGuidance item : items) {
            if (item.tag() == null || item.tag().isBlank()) {
                continue;
            }
            if (item.guidance() == null || item.guidance().isBlank()) {
                // An empty note is the absence of a note, not an empty row.
                continue;
            }
            ReportComputationTagGuidance row = new ReportComputationTagGuidance();
            row.setTag(item.tag().trim());
            row.setGuidance(item.guidance().trim());
            row.setSortOrder(order++);
            row.setComputation(computation);
            rows.add(row);
        }
        computation.getTagGuidance().clear();
        computation.getTagGuidance().addAll(rows);
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
            ReportPromptAssembler.AssembledPrompt prompt) {

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
                                        g.getTag(), g.getGuidance(), g.getSortOrder()))
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
                directBlockers(c),
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
