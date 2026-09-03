package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ReportTagBindingRequest;
import com.bodhpsychometric.dto.ReportTemplateRequest;
import com.bodhpsychometric.dto.ReportTemplateResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.report.ReportCoreFields;
import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.repository.report.ReportComputationRepository;
import com.bodhpsychometric.repository.report.ReportTemplateRepository;
import com.bodhpsychometric.security.RequestActor;

/**
 * Report templates: the library, the editor, the tag checklist, and publish.
 *
 * <p>The one idea worth understanding here is the <b>save-time reconcile</b>
 * ({@link #reconcileTags}). The HTML is the specification: every save re-parses
 * it, adds a binding row for each tag that appeared, and removes the row for
 * each tag that vanished. Answers to tags that survived are kept untouched. So
 * editing a template is never a form somebody has to keep in step by hand — it
 * is a diff, and the screen it produces is a checklist.
 */
@Service
@Transactional
public class ReportTemplateService {

    private final ReportTemplateRepository templates;
    private final ReportComputationRepository computations;
    private final TemplateTagParser parser;
    private final TemplateLint lint;
    private final ReportAccess access;
    private final ReportValueResolver values;
    private final ReportRenderer renderer;

    public ReportTemplateService(ReportTemplateRepository templates,
            ReportComputationRepository computations,
            TemplateTagParser parser,
            TemplateLint lint,
            ReportAccess access,
            ReportValueResolver values,
            ReportRenderer renderer) {
        this.templates = templates;
        this.computations = computations;
        this.parser = parser;
        this.lint = lint;
        this.access = access;
        this.values = values;
        this.renderer = renderer;
    }

    // ── reads ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ReportTemplateResponse> listAll() {
        access.requireActor();
        return templates.findAllWithBindings().stream()
                // Lint is not run for the list: it is a per-template parse and
                // nothing on that screen shows the findings. `publishable`
                // there therefore reflects binding completeness only.
                .map(t -> ReportTemplateResponse.from(t, List.of(), false))
                .toList();
    }

    @Transactional(readOnly = true)
    public ReportTemplateResponse get(Long id) {
        access.requireActor();
        ReportTemplate template = load(id);
        return ReportTemplateResponse.from(template, lint.check(template.getHtml()), true);
    }

    /** The CORE dropdown, so the UI never hardcodes the key list. */
    @Transactional(readOnly = true)
    public Map<String, String> coreFields() {
        access.requireActor();
        return ReportCoreFields.KEYS;
    }

    // ── writes ────────────────────────────────────────────────────────────

    public ReportTemplateResponse create(ReportTemplateRequest request) {
        RequestActor actor = access.requireAuthor();
        String name = request.name().trim();
        if (templates.existsByNameIgnoreCaseAndVersion(name, 1)) {
            throw new IllegalStateException(
                    "A template called \"" + name + "\" already exists");
        }

        ReportTemplate template = new ReportTemplate();
        template.setName(name);
        template.setDescription(trimToNull(request.description()));
        template.setHtml(request.html());
        template.setOrganizationId(request.organizationId());
        template.setCreatedByUserId(actor.userId());
        reconcileTags(template);

        ReportTemplate saved = templates.save(template);
        return ReportTemplateResponse.from(saved, lint.check(saved.getHtml()), true);
    }

    public ReportTemplateResponse update(Long id, ReportTemplateRequest request) {
        access.requireAuthor();
        ReportTemplate template = load(id);
        requireEditable(template);

        String name = request.name().trim();
        if (templates.existsByNameIgnoreCaseAndVersionAndReportTemplateIdNot(
                name, template.getVersion(), id)) {
            throw new IllegalStateException(
                    "A template called \"" + name + "\" already exists");
        }

        template.setName(name);
        template.setDescription(trimToNull(request.description()));
        template.setHtml(request.html());
        template.setOrganizationId(request.organizationId());
        reconcileTags(template);

        ReportTemplate saved = templates.save(template);
        return ReportTemplateResponse.from(saved, lint.check(saved.getHtml()), true);
    }

    /** Answer one tag. */
    public ReportTemplateResponse bindTag(Long id, String tag, ReportTagBindingRequest request) {
        access.requireAuthor();
        ReportTemplate template = load(id);
        requireEditable(template);

        ReportTagBinding binding = template.getBindings().stream()
                .filter(b -> b.getTag().equals(tag))
                .findFirst()
                .orElseThrow(() -> new NotFoundException(
                        "This template has no tag called \"" + tag + "\""));

        String type = request.binderType() == null ? "" : request.binderType().trim();
        validateBinding(type, request);

        binding.setBinderType(type);
        binding.setCoreField(ReportTagBinding.TYPE_CORE.equals(type)
                ? request.coreField().trim() : null);
        binding.setLiteralText(ReportTagBinding.TYPE_LITERAL.equals(type)
                ? request.literalText() : null);
        binding.setFormat(trimToNull(request.format()));
        binding.setFallbackText(trimToNull(request.fallbackText()));
        binding.setAuthorNote(trimToNull(request.authorNote()));

        ReportTemplate saved = templates.save(template);
        return ReportTemplateResponse.from(saved, lint.check(saved.getHtml()), true);
    }

    /**
     * Publish: freeze the template as renderable.
     *
     * <p>Two gates, and both are refusals rather than warnings, because a
     * published template is what a delivered report is built from:
     * <b>every tag answered</b>, and <b>no lint ERROR</b> — the second being
     * what stops the silent font failures P0a found from reaching a client.
     */
    public ReportTemplateResponse publish(Long id) {
        access.requireAuthor();
        ReportTemplate template = load(id);

        List<String> unbound = template.getBindings().stream()
                .filter(b -> !b.isBound())
                .map(ReportTagBinding::getTag)
                .toList();
        if (!unbound.isEmpty()) {
            throw new IllegalStateException(unbound.size() + " tag"
                    + (unbound.size() == 1 ? " is" : "s are") + " still unanswered: "
                    + String.join(", ", unbound.subList(0, Math.min(5, unbound.size())))
                    + (unbound.size() > 5 ? ", …" : ""));
        }

        List<TemplateLint.Finding> findings = lint.check(template.getHtml());
        if (!lint.isPublishable(findings)) {
            String first = findings.stream()
                    .filter(f -> f.severity() == TemplateLint.Severity.ERROR)
                    .findFirst().map(TemplateLint.Finding::message).orElse("");
            throw new IllegalStateException("This template would render incorrectly: " + first);
        }

        template.setStatus(ReportTemplate.STATUS_PUBLISHED);
        ReportTemplate saved = templates.save(template);
        return ReportTemplateResponse.from(saved, findings, true);
    }

    /**
     * Open a published template for editing by copying it to a new DRAFT
     * version.
     *
     * <p>This is the action {@link #requireEditable} tells people to take, and
     * without it a published template is a dead end: it cannot be edited, and
     * nothing else can produce version 2. A published template is frozen on
     * purpose — reports already delivered from it must keep meaning what they
     * said — so "editing" one is necessarily a copy, not a mutation.
     *
     * <p><b>Bindings are copied with it.</b> The whole point of a new version is
     * usually a small wording change, and making somebody re-answer fourteen
     * tags to fix a typo would guarantee they edit the live one instead.
     *
     * <p>The new row takes {@code max(version) + 1} for that name, so it cannot
     * collide with a version somebody made in between.
     */
    public ReportTemplateResponse newVersion(Long id) {
        RequestActor actor = access.requireAuthor();
        ReportTemplate source = load(id);

        int nextVersion = templates.findMaxVersionForName(source.getName())
                .orElse(source.getVersion()) + 1;

        ReportTemplate copy = new ReportTemplate();
        copy.setName(source.getName());
        copy.setDescription(source.getDescription());
        copy.setHtml(source.getHtml());
        copy.setOrganizationId(source.getOrganizationId());
        copy.setVersion(nextVersion);
        copy.setStatus(ReportTemplate.STATUS_DRAFT);
        copy.setCreatedByUserId(actor.userId());

        // Re-parse rather than copying tagsJson: the HTML is the specification,
        // and deriving it again means a copy can never carry a stale tag list.
        reconcileTags(copy);

        // Carry the answers across, matched by tag.
        Map<String, ReportTagBinding> sourceBindings = new LinkedHashMap<>();
        for (ReportTagBinding b : source.getBindings()) {
            sourceBindings.put(b.getTag(), b);
        }
        for (ReportTagBinding fresh : copy.getBindings()) {
            ReportTagBinding previous = sourceBindings.get(fresh.getTag());
            if (previous == null) {
                continue;
            }
            fresh.setBinderType(previous.getBinderType());
            fresh.setCoreField(previous.getCoreField());
            fresh.setLiteralText(previous.getLiteralText());
            fresh.setFormat(previous.getFormat());
            fresh.setFallbackText(previous.getFallbackText());
            fresh.setAuthorNote(previous.getAuthorNote());
        }

        ReportTemplate saved = templates.save(copy);
        return ReportTemplateResponse.from(saved, lint.check(saved.getHtml()), true);
    }

    public void delete(Long id) {
        access.requireAuthor();
        ReportTemplate template = load(id);

        // A computation points at its template by FK. Pre-checked rather than
        // caught: catching a DataIntegrityViolation inside @Transactional marks
        // the transaction rollback-only, so returning 409 would still 500 at
        // commit.
        long inUse = computations.countByTemplateReportTemplateId(id);
        if (inUse > 0) {
            throw new IllegalStateException("This template is used by " + inUse
                    + " computation" + (inUse == 1 ? "" : "s")
                    + " and cannot be deleted.");
        }

        // Bindings are composition and go with it (orphanRemoval).
        templates.delete(template);
    }

    // ── render ────────────────────────────────────────────────────────────

    /**
     * Render with stand-in values and no respondent.
     *
     * <p>The only way to check a layout while authoring — and, with the
     * development database empty, the only way to exercise the render path at
     * all today. Works on a DRAFT on purpose: previewing an unfinished
     * template is the entire point, and unbound tags show their fallback.
     */
    @Transactional(readOnly = true)
    public byte[] previewPdf(Long id) {
        access.requireRenderer();
        ReportTemplate template = load(id);
        Map<String, String> resolved = values.resolve(template, values.sampleCoreValues());
        return renderer.toPdf(parser.substitute(template.getHtml(), resolved)).bytes();
    }

    /** Same values, served as a page — the Interactive format, nearly free. */
    @Transactional(readOnly = true)
    public String previewHtml(Long id) {
        access.requireRenderer();
        ReportTemplate template = load(id);
        Map<String, String> resolved = values.resolve(template, values.sampleCoreValues());
        return renderer.toHtml(parser.substitute(template.getHtml(), resolved));
    }

    // ── internals ─────────────────────────────────────────────────────────

    /**
     * Re-parse the HTML and bring the binding rows into line with it.
     *
     * <p>Answers survive: a tag still present keeps whatever it was bound to,
     * so fixing a typo in a heading does not throw away an afternoon of
     * binding work. A tag that vanished loses its row, which is the only
     * behaviour that keeps "tags bound / tags total" honest.
     */
    private void reconcileTags(ReportTemplate template) {
        List<String> tags = parser.parse(template.getHtml());

        Map<String, ReportTagBinding> existing = new LinkedHashMap<>();
        for (ReportTagBinding b : template.getBindings()) {
            existing.put(b.getTag(), b);
        }

        List<ReportTagBinding> kept = new ArrayList<>(tags.size());
        int order = 0;
        for (String tag : tags) {
            ReportTagBinding binding = existing.remove(tag);
            if (binding == null) {
                binding = new ReportTagBinding();
                binding.setTag(tag);
                binding.setTemplate(template);
            }
            binding.setSortOrder(order++);
            kept.add(binding);
        }

        // Whatever is left in `existing` no longer appears in the HTML.
        // orphanRemoval deletes them once they are off the collection.
        template.getBindings().clear();
        template.getBindings().addAll(kept);
        for (ReportTagBinding b : kept) {
            b.setTemplate(template);
        }

        template.setTagsJson(toJsonArray(tags));
    }

    private void validateBinding(String type, ReportTagBindingRequest request) {
        if (!ReportTagBinding.isKnown(type)) {
            throw new IllegalArgumentException("Unknown binding type \"" + type + "\"");
        }
        if (!ReportTagBinding.isImplemented(type)) {
            throw new IllegalArgumentException(type + " bindings need the scoring engine, "
                    + "which is not built yet. Use CORE or LITERAL for now.");
        }
        if (ReportTagBinding.TYPE_CORE.equals(type)) {
            String field = request.coreField() == null ? null : request.coreField().trim();
            if (field == null || field.isBlank()) {
                throw new IllegalArgumentException("Choose which respondent detail fills this tag");
            }
            if (!ReportCoreFields.isKnown(field)) {
                throw new IllegalArgumentException("\"" + field + "\" is not a respondent detail "
                        + "this report can print");
            }
        }
        if (ReportTagBinding.TYPE_LITERAL.equals(type)
                && (request.literalText() == null || request.literalText().isBlank())) {
            throw new IllegalArgumentException("Type the text this tag should print");
        }
    }

    /**
     * A published template is frozen. Editing one would silently change what a
     * report already delivered from it means — the whole reason versions exist.
     */
    private void requireEditable(ReportTemplate template) {
        if (ReportTemplate.STATUS_PUBLISHED.equals(template.getStatus())) {
            throw new IllegalStateException("This template is published and cannot be edited. "
                    + "Publish a new version instead.");
        }
        if (ReportTemplate.STATUS_ARCHIVED.equals(template.getStatus())) {
            throw new IllegalStateException("This template is archived.");
        }
    }

    private ReportTemplate load(Long id) {
        return templates.findByIdWithBindings(id)
                .orElseThrow(() -> new NotFoundException("Report template " + id + " not found"));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Hand-built rather than Jackson: the content is a list of names already
     * constrained by the parser's own character class, so there is nothing to
     * escape and no reason to pull a mapper into this path.
     */
    private static String toJsonArray(List<String> tags) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < tags.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(tags.get(i)).append('"');
        }
        return sb.append(']').toString();
    }

    /** Kept for callers that want tags in document order without a parse. */
    public static Comparator<ReportTagBinding> byDocumentOrder() {
        return Comparator.comparingInt(ReportTagBinding::getSortOrder);
    }
}
