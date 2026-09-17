package com.bodhpsychometric.model.report;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One row of the practitioner's Items_Master tab, joined to this platform.
 *
 * <p>A scoring workbook is written in its item sheet's vocabulary — {@code V3},
 * {@code I1}, {@code Internal Drive} — and nothing in this product knew any of
 * those words. This is the dictionary that makes the rules mean something.
 *
 * <p><b>Not a rule and never evaluated.</b> A binding is read at rule-authoring
 * time, to turn an item code into a column key. What gets stored from that is a
 * {@link ReportRuleVersion} holding the resolved key, and the version is what a
 * computation pins — so editing a binding afterwards cannot change what an
 * already-written rule means. That is exactly why there is no version history
 * here and why a re-import overwrites in place.
 *
 * <p><b>Keyed on the assessment</b> ({@code assessmentId} + {@code itemCode}
 * unique). An item code belongs to the instrument, not to the bank question:
 * the same question may be {@code I1} in one workbook and {@code I7} in
 * another. Keying on the questionnaire would share bindings between
 * assessments, which is attractive until a re-import for one assessment
 * silently changes what another's rules mean.
 */
@Entity
@Table(name = "ReportItemBinding",
        uniqueConstraints = @UniqueConstraint(name = "uqRibAssessmentItemCode",
                columnNames = {"assessmentId", "itemCode"}),
        indexes = {
                @Index(name = "idxRibAssessment", columnList = "assessmentId"),
                @Index(name = "idxRibQuestion", columnList = "questionId")
        })
public class ReportItemBinding implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    /**
     * How the question was found.
     *
     * <p>Stored rather than recomputed, because it is the reviewer's audit
     * trail: a {@code FUZZY} match nobody upgraded to {@code MANUAL} is a
     * different fact from one a person actually confirmed.
     */
    public static final String MATCH_EXACT = "EXACT";
    public static final String MATCH_NORMALISED = "NORMALISED";
    public static final String MATCH_FUZZY = "FUZZY";
    public static final String MATCH_MANUAL = "MANUAL";
    public static final String MATCH_NONE = "NONE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportItemBindingId;

    /** NOT an FK, matching ReportRule — see the migration. */
    @Column(name = "assessmentId", nullable = false)
    private Long assessmentId;

    // ── what the sheet said ───────────────────────────────────────────────

    @Column(name = "itemCode", nullable = false, length = 40)
    private String itemCode;

    @Column(name = "adminPosition")
    private Integer adminPosition;

    @Column(name = "factorLabel", length = 160)
    private String factorLabel;

    @Column(name = "constructLabel", length = 160)
    private String constructLabel;

    /**
     * The sheet's own wording, kept for the life of the binding.
     *
     * <p>It is the match key, so keeping it is what lets a re-import notice
     * that the practitioner reworded an item rather than silently re-matching
     * it — and what still answers "which question did I1 mean?" a year after
     * somebody edited the stem.
     */
    @Column(name = "statement", columnDefinition = "TEXT", nullable = false)
    private String statement;

    @Column(name = "reverseScored", nullable = false)
    private boolean reverseScored;

    @Column(name = "inComposite", nullable = false)
    private boolean inComposite = true;

    // ── what it resolved to ───────────────────────────────────────────────

    @Column(name = "questionId")
    private Long questionId;

    @Column(name = "questionnaireQuestionId")
    private Long questionnaireQuestionId;

    /**
     * The placement's tag at the time of binding, for display only.
     *
     * <p>Never the join. {@code questionTag} is regenerated wholesale on every
     * placement save and is positional, so a reorder would re-point every
     * binding that trusted it. {@code questionId} is the identity.
     */
    @Column(name = "questionTag", length = 50)
    private String questionTag;

    @Column(name = "mqId")
    private Long mqId;

    @Column(name = "mqtId")
    private Long mqtId;

    @Column(name = "matchMethod", nullable = false, length = 16)
    private String matchMethod = MATCH_NONE;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updatedAt", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    /** True when this item resolved to a question at all. */
    public boolean isResolved() {
        return questionId != null;
    }

    // ── accessors ─────────────────────────────────────────────────────────

    public Long getReportItemBindingId() {
        return reportItemBindingId;
    }

    public void setReportItemBindingId(Long reportItemBindingId) {
        this.reportItemBindingId = reportItemBindingId;
    }

    public Long getAssessmentId() {
        return assessmentId;
    }

    public void setAssessmentId(Long assessmentId) {
        this.assessmentId = assessmentId;
    }

    public String getItemCode() {
        return itemCode;
    }

    public void setItemCode(String itemCode) {
        this.itemCode = itemCode;
    }

    public Integer getAdminPosition() {
        return adminPosition;
    }

    public void setAdminPosition(Integer adminPosition) {
        this.adminPosition = adminPosition;
    }

    public String getFactorLabel() {
        return factorLabel;
    }

    public void setFactorLabel(String factorLabel) {
        this.factorLabel = factorLabel;
    }

    public String getConstructLabel() {
        return constructLabel;
    }

    public void setConstructLabel(String constructLabel) {
        this.constructLabel = constructLabel;
    }

    public String getStatement() {
        return statement;
    }

    public void setStatement(String statement) {
        this.statement = statement;
    }

    public boolean isReverseScored() {
        return reverseScored;
    }

    public void setReverseScored(boolean reverseScored) {
        this.reverseScored = reverseScored;
    }

    public boolean isInComposite() {
        return inComposite;
    }

    public void setInComposite(boolean inComposite) {
        this.inComposite = inComposite;
    }

    public Long getQuestionId() {
        return questionId;
    }

    public void setQuestionId(Long questionId) {
        this.questionId = questionId;
    }

    public Long getQuestionnaireQuestionId() {
        return questionnaireQuestionId;
    }

    public void setQuestionnaireQuestionId(Long questionnaireQuestionId) {
        this.questionnaireQuestionId = questionnaireQuestionId;
    }

    public String getQuestionTag() {
        return questionTag;
    }

    public void setQuestionTag(String questionTag) {
        this.questionTag = questionTag;
    }

    public Long getMqId() {
        return mqId;
    }

    public void setMqId(Long mqId) {
        this.mqId = mqId;
    }

    public Long getMqtId() {
        return mqtId;
    }

    public void setMqtId(Long mqtId) {
        this.mqtId = mqtId;
    }

    public String getMatchMethod() {
        return matchMethod;
    }

    public void setMatchMethod(String matchMethod) {
        this.matchMethod = matchMethod;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
