package com.bodhpsychometric.model.report;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A named, reusable unit of scoring or interpretation logic — the
 * psychometrician's own work, stored so it can be referenced by name from many
 * computations.
 *
 * <p>This is <b>input</b> to the report engine, not its output. A
 * {@link ReportComputation} is the thing that will eventually hold generated
 * code; a rule is what a human wrote and what the model is told to implement.
 * Keeping them apart is what lets one rule serve many reports.
 *
 * <p><b>Editing never mutates.</b> Every save writes a new immutable
 * {@link ReportRuleVersion} and a computation pins the exact version it used.
 * That is what makes "a rule edit cannot silently change an already-approved
 * report" a property of the schema rather than a promise.
 *
 * <p>Rules are <b>global by default</b> ({@code assessmentId} null). MQ/MQT
 * identifiers are global, so a rule written over {@code mqt:} keys runs on any
 * assessment that scores those MQTs. Whether it actually can is <b>derived, not
 * stored</b> — an assessment's columns change when questions are unplaced, so a
 * cached answer would go stale silently.
 */
@Entity
@Table(name = "ReportRule")
public class ReportRule implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    /**
     * Which step of the authoring pipeline a rule is filed under.
     *
     * <p>The workbook's steps 0 (data capture) and 2 (reverse scoring) are
     * absent on purpose — neither is a report rule. Step 0 is the platform:
     * answers already exist per attempt, and "every item answered" is the
     * COMPLETED filter the dataset applies. Step 2 belongs upstream in the
     * question bank, because {@code MqtScoringService} sums
     * {@code OptionMqtScore} — reversing at report time would make
     * {@code mqt:} mean one thing in a sheet and another in a report.
     */
    public static final String STAGE_VALIDITY = "VALIDITY";
    public static final String STAGE_SCORE = "SCORE";
    public static final String STAGE_BAND = "BAND";
    public static final String STAGE_PROFILE = "PROFILE";
    public static final String STAGE_EDGE = "EDGE";

    /** In pipeline order — the rail renders straight from this. */
    public static final List<String> STAGES = List.of(
            STAGE_VALIDITY, STAGE_SCORE, STAGE_BAND, STAGE_PROFILE, STAGE_EDGE);

    public static boolean isKnownStage(String stage) {
        return stage != null && STAGES.contains(stage);
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportRuleId;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    /** How the rule is referred to in a prompt. Globally unique. */
    @Column(name = "slug", nullable = false, length = 80)
    private String slug;

    @Column(name = "description", length = 1000)
    private String description;

    /** NULL = global and portable. Not an FK — see the migration. */
    @Column(name = "assessmentId")
    private Long assessmentId;

    /**
     * Which authoring step this rule is filed under.
     *
     * <p>On the rule and not on the version deliberately: moving a rule between
     * steps is a change of filing, not of logic, and must not mint a version —
     * a version is what a computation pins and what explains an approved
     * report.
     */
    @Column(name = "stage", nullable = false, length = 24)
    private String stage = STAGE_SCORE;

    /** Author order within the stage. */
    @Column(name = "stepOrder", nullable = false)
    private int stepOrder;

    @Column(name = "status", nullable = false, length = 12)
    private String status = STATUS_ACTIVE;

    @Column(name = "createdByUserId")
    private Long createdByUserId;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updatedAt", nullable = false)
    private OffsetDateTime updatedAt;

    @OneToMany(mappedBy = "rule", cascade = CascadeType.ALL,
            orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("version ASC")
    private List<ReportRuleVersion> versions = new ArrayList<>();

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

    public void addVersion(ReportRuleVersion version) {
        versions.add(version);
        version.setRule(this);
    }

    /** The newest version — what the library list and the picker show. */
    public Optional<ReportRuleVersion> latestVersion() {
        return versions.stream().max(Comparator.comparingInt(ReportRuleVersion::getVersion));
    }

    public int nextVersionNumber() {
        return latestVersion().map(v -> v.getVersion() + 1).orElse(1);
    }

    // ── accessors ─────────────────────────────────────────────────────────

    public Long getReportRuleId() {
        return reportRuleId;
    }

    public void setReportRuleId(Long reportRuleId) {
        this.reportRuleId = reportRuleId;
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

    public String getStage() {
        return stage;
    }

    public void setStage(String stage) {
        this.stage = stage;
    }

    public int getStepOrder() {
        return stepOrder;
    }

    public void setStepOrder(int stepOrder) {
        this.stepOrder = stepOrder;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
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

    public List<ReportRuleVersion> getVersions() {
        return versions;
    }

    public void setVersions(List<ReportRuleVersion> versions) {
        this.versions = versions;
    }
}
