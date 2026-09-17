package com.bodhpsychometric.model.report;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * One report-generation job being assembled: which rules, which template, which
 * respondents, and what the psychometrician wants the model to do with them.
 *
 * <p><b>Today this is everything up to "ready to send".</b> No AI provider has
 * been chosen, so nothing here calls one and there is no generated artifact —
 * {@link #STATUS_READY_FOR_GENERATION} is as far as a computation can get. The
 * table that will hold generated Python ({@code report_computation_version},
 * with its artifact kind, body and pinned sandbox image digest) arrives with
 * P4, once there is a provider whose output shape is known.
 *
 * <p>Rules are referenced by <b>version</b>, never by rule id — see
 * {@link ReportComputationRule}. That pin is what makes the P5 approval gate
 * meaningful: what a human approved cannot be altered afterwards by someone
 * editing a rule elsewhere in the library.
 */
@Entity
@Table(name = "ReportComputation")
public class ReportComputation implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    /** Being assembled. May be missing a template, rules or a prompt. */
    public static final String STATUS_DRAFT = "DRAFT";

    /** Everything the meta-prompt needs is present. The current ceiling. */
    public static final String STATUS_READY_FOR_GENERATION = "READY_FOR_GENERATION";

    /** An artifact exists. P4. */
    public static final String STATUS_GENERATED = "GENERATED";

    /** A human read sample reports and signed off. P5, and mandatory. */
    public static final String STATUS_APPROVED = "APPROVED";

    public static final String STATUS_ARCHIVED = "ARCHIVED";

    /**
     * Evaluated here, in Java, from the pinned rule versions themselves — no
     * model, no generated code, no sandbox. Available exactly when every pinned
     * rule is an {@code EXPRESSION}: a {@code STATEMENT} has no runnable form.
     */
    public static final String MODE_DIRECT = "DIRECT";

    /** A model writes the artifact and the sandbox runs it. P4. */
    public static final String MODE_GENERATED = "GENERATED";

    public static boolean isKnownMode(String mode) {
        return MODE_DIRECT.equals(mode) || MODE_GENERATED.equals(mode);
    }

    /** Every completed attempt on the assessment. */
    public static final String SCOPE_ALL_COMPLETED = "ALL_COMPLETED";

    /** Only the respondents named in {@code respondentIdsJson}. */
    public static final String SCOPE_SELECTED = "SELECTED";

    public static boolean isKnownScope(String scope) {
        return SCOPE_ALL_COMPLETED.equals(scope) || SCOPE_SELECTED.equals(scope);
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportComputationId;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "slug", nullable = false, length = 80)
    private String slug;

    @Column(name = "description", length = 1000)
    private String description;

    /**
     * Not an FK and not nullable: every column reference in every selected rule
     * is validated against THIS assessment's live column list, so a computation
     * without one could not be checked at all.
     */
    @Column(name = "assessmentId", nullable = false)
    private Long assessmentId;

    @Column(name = "organizationId")
    private Long organizationId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reportTemplateId",
            foreignKey = @ForeignKey(name = "fkRcTemplate"))
    private ReportTemplate template;

    @Column(name = "status", nullable = false, length = 24)
    private String status = STATUS_DRAFT;

    /**
     * DIRECT or GENERATED. Defaulted to DIRECT because a computation starts with
     * no rules, and a computation with no rules genuinely needs no generation —
     * the service raises it to GENERATED the moment a STATEMENT rule is pinned,
     * so the field follows the rules rather than the author's intent.
     */
    @Column(name = "mode", nullable = false, length = 16)
    private String mode = MODE_DIRECT;

    /** The guidance prompt, verbatim. Spec §5 forbids paraphrasing it. */
    @Column(name = "sourcePrompt", columnDefinition = "TEXT")
    private String sourcePrompt;

    @Column(name = "respondentScope", nullable = false, length = 16)
    private String respondentScope = SCOPE_ALL_COMPLETED;

    /** JSON array of respondentUserIds, when the scope is SELECTED. */
    @Column(name = "respondentIdsJson", columnDefinition = "TEXT")
    private String respondentIdsJson;

    @Column(name = "createdByUserId")
    private Long createdByUserId;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updatedAt", nullable = false)
    private OffsetDateTime updatedAt;

    /**
     * Who approved, when, and over how many completed respondents.
     *
     * <p>Approval is the one human act in the whole path, and until these
     * existed it left no record. All three are null until {@code approve} and
     * cleared by {@code clone}, so a copy starts unapproved and says so.
     * {@code approvedCohortSize} is the number the cohort-relative rules were
     * checked over — the fact a reader of a report needs when they ask "a
     * percentile of what?".
     */
    @Column(name = "approvedByUserId")
    private Long approvedByUserId;

    @Column(name = "approvedAt")
    private OffsetDateTime approvedAt;

    @Column(name = "approvedCohortSize")
    private Integer approvedCohortSize;

    @OneToMany(mappedBy = "computation", cascade = CascadeType.ALL,
            orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<ReportComputationRule> rules = new ArrayList<>();

    @OneToMany(mappedBy = "computation", cascade = CascadeType.ALL,
            orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<ReportComputationTagGuidance> tagGuidance = new ArrayList<>();

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

    public void addRule(ReportComputationRule link) {
        rules.add(link);
        link.setComputation(this);
    }

    public void addTagGuidance(ReportComputationTagGuidance guidance) {
        tagGuidance.add(guidance);
        guidance.setComputation(this);
    }

    /**
     * The respondent ids a SELECTED scope names; empty for ALL_COMPLETED.
     *
     * <p>Parsed here rather than in each consumer so the JSON's shape has one
     * reader. The array holds numbers only, so a digit scan is the whole
     * parser.
     */
    public java.util.Set<Long> selectedRespondentIds() {
        java.util.Set<Long> out = new java.util.LinkedHashSet<>();
        if (!SCOPE_SELECTED.equals(respondentScope) || respondentIdsJson == null) {
            return out;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\d+").matcher(respondentIdsJson);
        while (m.find()) {
            out.add(Long.valueOf(m.group()));
        }
        return out;
    }

    public Long getApprovedByUserId() {
        return approvedByUserId;
    }

    public void setApprovedByUserId(Long approvedByUserId) {
        this.approvedByUserId = approvedByUserId;
    }

    public OffsetDateTime getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(OffsetDateTime approvedAt) {
        this.approvedAt = approvedAt;
    }

    public Integer getApprovedCohortSize() {
        return approvedCohortSize;
    }

    public void setApprovedCohortSize(Integer approvedCohortSize) {
        this.approvedCohortSize = approvedCohortSize;
    }

    // ── accessors ─────────────────────────────────────────────────────────

    public Long getReportComputationId() {
        return reportComputationId;
    }

    public void setReportComputationId(Long reportComputationId) {
        this.reportComputationId = reportComputationId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Long getAssessmentId() {
        return assessmentId;
    }

    public void setAssessmentId(Long assessmentId) {
        this.assessmentId = assessmentId;
    }

    public Long getOrganizationId() {
        return organizationId;
    }

    public void setOrganizationId(Long organizationId) {
        this.organizationId = organizationId;
    }

    public ReportTemplate getTemplate() {
        return template;
    }

    public void setTemplate(ReportTemplate template) {
        this.template = template;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    /** True when this computation delivers without a model. */
    public boolean isDirect() {
        return MODE_DIRECT.equals(mode);
    }

    public String getSourcePrompt() {
        return sourcePrompt;
    }

    public void setSourcePrompt(String sourcePrompt) {
        this.sourcePrompt = sourcePrompt;
    }

    public String getRespondentScope() {
        return respondentScope;
    }

    public void setRespondentScope(String respondentScope) {
        this.respondentScope = respondentScope;
    }

    public String getRespondentIdsJson() {
        return respondentIdsJson;
    }

    public void setRespondentIdsJson(String respondentIdsJson) {
        this.respondentIdsJson = respondentIdsJson;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public List<ReportComputationRule> getRules() {
        return rules;
    }

    public void setRules(List<ReportComputationRule> rules) {
        this.rules = rules;
    }

    public List<ReportComputationTagGuidance> getTagGuidance() {
        return tagGuidance;
    }

    public void setTagGuidance(List<ReportComputationTagGuidance> tagGuidance) {
        this.tagGuidance = tagGuidance;
    }
}
