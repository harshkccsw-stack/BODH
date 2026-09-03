package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;
import java.util.List;

import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;

/**
 * A rule as the library needs it: the row, its latest definition, and its
 * version history.
 */
public record ReportRuleResponse(
        Long reportRuleId,
        String name,
        String slug,
        String description,
        Long assessmentId,
        String status,
        int latestVersion,
        RuleVersion latest,
        List<RuleVersion> versions,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public record RuleVersion(
            Long reportRuleVersionId,
            int version,
            String definitionKind,
            String expression,
            String statementText,
            String resultType,
            List<String> referencedKeys,
            boolean population,
            Long validatedAssessmentId,
            String notes,
            OffsetDateTime createdAt) {

        public static RuleVersion from(ReportRuleVersion v, List<String> referencedKeys) {
            return new RuleVersion(
                    v.getReportRuleVersionId(),
                    v.getVersion(),
                    v.getDefinitionKind(),
                    v.getExpression(),
                    v.getStatementText(),
                    v.getResultType(),
                    referencedKeys,
                    v.isPopulation(),
                    v.getValidatedAssessmentId(),
                    v.getNotes(),
                    v.getCreatedAt());
        }
    }

    public static ReportRuleResponse from(ReportRule rule, List<RuleVersion> versions) {
        RuleVersion latest = versions.isEmpty() ? null : versions.get(versions.size() - 1);
        return new ReportRuleResponse(
                rule.getReportRuleId(),
                rule.getName(),
                rule.getSlug(),
                rule.getDescription(),
                rule.getAssessmentId(),
                rule.getStatus(),
                latest == null ? 0 : latest.version(),
                latest,
                versions,
                rule.getCreatedAt(),
                rule.getUpdatedAt());
    }
}
