package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;
import java.util.List;

import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.service.report.TemplateLint;

/**
 * A template as the authoring screen needs it: the row, its tag checklist, and
 * whatever the lint has to say.
 *
 * <p>{@code boundCount} / {@code tagCount} are computed here rather than
 * counted in the browser so the list and the detail screen can never disagree
 * about "9 of 14".
 */
public record ReportTemplateResponse(
        Long reportTemplateId,
        String name,
        String description,
        String html,
        String status,
        int version,
        Long organizationId,
        int tagCount,
        int boundCount,
        boolean publishable,
        List<TagBinding> bindings,
        List<LintFinding> lint,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public record TagBinding(
            Long reportTagBindingId,
            String tag,
            String binderType,
            String coreField,
            String literalText,
            String format,
            String fallbackText,
            String authorNote,
            int sortOrder,
            boolean bound) {

        public static TagBinding from(ReportTagBinding b) {
            return new TagBinding(
                    b.getReportTagBindingId(),
                    b.getTag(),
                    b.getBinderType(),
                    b.getCoreField(),
                    b.getLiteralText(),
                    b.getFormat(),
                    b.getFallbackText(),
                    b.getAuthorNote(),
                    b.getSortOrder(),
                    b.isBound());
        }
    }

    public record LintFinding(String severity, String rule, String message) {
        public static LintFinding from(TemplateLint.Finding f) {
            return new LintFinding(f.severity().name(), f.rule(), f.message());
        }
    }

    /**
     * @param includeHtml the library list omits it — a page of twenty
     *        templates each carrying a base64 logo is megabytes of payload
     *        nothing on that screen reads
     */
    public static ReportTemplateResponse from(ReportTemplate t,
            List<TemplateLint.Finding> findings, boolean includeHtml) {

        List<TagBinding> bindings = t.getBindings().stream()
                .map(TagBinding::from)
                .toList();
        int bound = (int) bindings.stream().filter(TagBinding::bound).count();
        boolean lintClean = findings.stream()
                .noneMatch(f -> f.severity() == TemplateLint.Severity.ERROR);

        return new ReportTemplateResponse(
                t.getReportTemplateId(),
                t.getName(),
                t.getDescription(),
                includeHtml ? t.getHtml() : null,
                t.getStatus(),
                t.getVersion(),
                t.getOrganizationId(),
                bindings.size(),
                bound,
                lintClean && bound == bindings.size(),
                bindings,
                findings.stream().map(LintFinding::from).toList(),
                t.getCreatedAt(),
                t.getUpdatedAt());
    }
}
