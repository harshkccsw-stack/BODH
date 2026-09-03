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
    private final ReportAccess access;

    public ReportComputationService(ReportComputationRepository computations,
            ReportComputationTagGuidanceRepository tagGuidance,
            ReportRuleVersionRepository ruleVersions,
            ReportTemplateRepository templates,
            ReportColumnCatalog columns,
            ReportPromptAssembler assembler,
            ReportAccess access) {
        this.computations = computations;
        this.tagGuidance = tagGuidance;
        this.ruleVersions = ruleVersions;
        this.templates = templates;
        this.columns = columns;
        this.assembler = assembler;
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
