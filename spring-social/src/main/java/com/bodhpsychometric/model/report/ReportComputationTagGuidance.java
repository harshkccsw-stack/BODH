package com.bodhpsychometric.model.report;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * One placeholder's ANSWER on a computation — the tag-answer row.
 *
 * <p>The template declares only a tag's shape: a value goes here, a paragraph
 * goes there. What fills it is this assessment's business and lives here:
 * {@link #ruleSlug} names the pinned rule whose result prints in a VALUE tag;
 * {@link #guidance} says what a NARRATIVE tag's paragraph should say. Both
 * belong to one COMPUTATION, so two assessments over the same published
 * template answer the same tag differently without the template being copied
 * — which is what makes a template portable at all.
 *
 * <p>Historically this table held guidance only, and a VALUE tag's rule was a
 * pointer on the template binding itself. That pointer made the template
 * unfinishable before a computation existed and the computation unapprovable
 * before the template was published; {@code V33} moved the answer here.
 */
@Entity
@Table(name = "ReportComputationTagGuidance")
public class ReportComputationTagGuidance implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportComputationTagGuidanceId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reportComputationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRctgComputation"))
    private ReportComputation computation;

    @Column(name = "tag", nullable = false, length = 80)
    private String tag;

    @Column(name = "guidance", columnDefinition = "TEXT")
    private String guidance;

    /** VALUE tags: the slug of the pinned rule whose result prints here. */
    @Column(name = "ruleSlug", length = 80)
    private String ruleSlug;

    /** Optional {@code DecimalFormat} pattern; overrides the template's. */
    @Column(name = "format", length = 40)
    private String format;

    /** Printed when the value is empty; overrides the template's. */
    @Column(name = "fallbackText", length = 255)
    private String fallbackText;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    /** True when this row answers a VALUE tag with a rule. */
    public boolean fillsValue() {
        return ruleSlug != null && !ruleSlug.isBlank();
    }

    public String getRuleSlug() {
        return ruleSlug;
    }

    public void setRuleSlug(String ruleSlug) {
        this.ruleSlug = ruleSlug;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        this.format = format;
    }

    public String getFallbackText() {
        return fallbackText;
    }

    public void setFallbackText(String fallbackText) {
        this.fallbackText = fallbackText;
    }

    public Long getReportComputationTagGuidanceId() {
        return reportComputationTagGuidanceId;
    }

    public void setReportComputationTagGuidanceId(Long id) {
        this.reportComputationTagGuidanceId = id;
    }

    public ReportComputation getComputation() {
        return computation;
    }

    public void setComputation(ReportComputation computation) {
        this.computation = computation;
    }

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }

    public String getGuidance() {
        return guidance;
    }

    public void setGuidance(String guidance) {
        this.guidance = guidance;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
