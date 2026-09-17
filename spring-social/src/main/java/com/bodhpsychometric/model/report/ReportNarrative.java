package com.bodhpsychometric.model.report;

import java.time.LocalDateTime;

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
 * One paragraph a model wrote for one respondent, for one {@code ${tag}}.
 *
 * <h2>Why this is stored rather than produced on demand</h2>
 *
 * <p>Every other number on a report is reproducible: the rule versions are
 * pinned, the expressions are deterministic, and running delivery twice gives
 * the same PDF twice. Prose from a model has neither property. Regenerating on
 * every download would mean a report re-issued to the same person next week
 * says something different, with nothing to point at that explains why — which
 * is the exact failure the pinned-version machinery exists to prevent.
 *
 * <p>So the first generation is kept and every later render reuses it.
 *
 * <h2>What makes the reuse honest</h2>
 *
 * <p>{@link #promptFingerprint} hashes everything that fed the call: the tag,
 * the guidance text, the model name, and the computed values themselves. A
 * stored row is reused only when the fingerprint still matches. Edit the
 * guidance, re-score the respondent, or switch models, and it no longer does —
 * so the narrative is rewritten instead of quietly describing a number that has
 * since changed. A cache without this is worse than no cache: it produces prose
 * that confidently contradicts the table printed beside it.
 *
 * <h2>What was never sent</h2>
 *
 * <p>No row here was produced from a name, an email, a serial id or a
 * respondent id — {@link com.bodhpsychometric.service.report.ReportColumnCatalog#IDENTITY_KEYS}
 * is stripped from the payload and the stripping is asserted, not assumed. The
 * model is given scores and the guidance and nothing that identifies whose they
 * are. That is why this table stores the attempt id beside the text: the join
 * back to a person happens here, in the database, after the fact.
 */
@Entity
@Table(name = "ReportNarrative")
public class ReportNarrative implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportNarrativeId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reportComputationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRnComputation"))
    private ReportComputation computation;

    /**
     * The attempt this was written about.
     *
     * <p>A plain id, not a {@code @ManyToOne}, and deliberately so: loading a
     * narrative must never drag a respondent graph into scope. Nothing on this
     * path has any business reaching a person's name, and the cheapest way to
     * keep that true is to make it unreachable from here.
     */
    @Column(name = "respondentAssessmentMappingId", nullable = false)
    private Long respondentAssessmentMappingId;

    @Column(name = "tag", nullable = false, length = 80)
    private String tag;

    @Column(name = "narrativeText", nullable = false, columnDefinition = "TEXT")
    private String narrativeText;

    /** SHA-256 of guidance + tag + model + the computed values. See class note. */
    @Column(name = "promptFingerprint", nullable = false, length = 64)
    private String promptFingerprint;

    /** Which model wrote it. Recorded so a later change of model is visible. */
    @Column(name = "model", length = 80)
    private String model;

    @Column(name = "generatedAt", nullable = false)
    private LocalDateTime generatedAt;

    // ── accessors ─────────────────────────────────────────────────────────

    public Long getReportNarrativeId() {
        return reportNarrativeId;
    }

    public void setReportNarrativeId(Long reportNarrativeId) {
        this.reportNarrativeId = reportNarrativeId;
    }

    public ReportComputation getComputation() {
        return computation;
    }

    public void setComputation(ReportComputation computation) {
        this.computation = computation;
    }

    public Long getRespondentAssessmentMappingId() {
        return respondentAssessmentMappingId;
    }

    public void setRespondentAssessmentMappingId(Long respondentAssessmentMappingId) {
        this.respondentAssessmentMappingId = respondentAssessmentMappingId;
    }

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }

    public String getNarrativeText() {
        return narrativeText;
    }

    public void setNarrativeText(String narrativeText) {
        this.narrativeText = narrativeText;
    }

    public String getPromptFingerprint() {
        return promptFingerprint;
    }

    public void setPromptFingerprint(String promptFingerprint) {
        this.promptFingerprint = promptFingerprint;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public LocalDateTime getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(LocalDateTime generatedAt) {
        this.generatedAt = generatedAt;
    }
}
