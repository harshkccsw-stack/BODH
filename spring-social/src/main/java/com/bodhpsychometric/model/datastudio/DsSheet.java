package com.bodhpsychometric.model.datastudio;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A sheet binds ONE assessment's live rows to a set of computed columns
 * ({@link DsDerivedColumn}) and some display state.
 *
 * <p>{@code sourceFilters} is the binding, stored as a small JSON object:
 * {@code {"assessmentId": 12, "organizationId": 3}} — the organization is
 * optional and narrows the rows to that org's members. It is JSON rather than
 * two columns because the filter set is expected to grow (date windows,
 * status, cohort) and every addition would otherwise be a migration.
 *
 * <p>{@code sourceView} and {@code grain} are carried forward from the v1
 * design so a second view can be added later without a schema change; today
 * the only value either takes is {@code assessment} / {@code respondent_attempt}.
 *
 * <p>{@code displayState} is opaque to the backend — column order, widths,
 * hidden columns, sort. The dashboard writes it and the dashboard reads it;
 * nothing here parses it.
 */
@Entity
@Table(name = "DsSheet")
public class DsSheet implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    /** The only source view v1 serves: one assessment's allotted attempts. */
    public static final String VIEW_ASSESSMENT = "assessment";

    /** One row per allotted attempt, whatever state that attempt is in. */
    public static final String GRAIN_RESPONDENT_ATTEMPT = "respondent_attempt";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long dsSheetId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dsWorkbookId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDsSheetWorkbook"))
    private DsWorkbook workbook;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "sourceView", nullable = false, length = 40)
    private String sourceView = VIEW_ASSESSMENT;

    /** JSON object: {"assessmentId": .., "organizationId": ..}. */
    @Column(name = "sourceFilters", columnDefinition = "TEXT")
    private String sourceFilters;

    @Column(name = "grain", nullable = false, length = 32)
    private String grain = GRAIN_RESPONDENT_ATTEMPT;

    /** JSON, opaque to the backend — column order, widths, hidden, sort. */
    @Column(name = "displayState", columnDefinition = "TEXT")
    private String displayState;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

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

    public Long getDsSheetId() {
        return dsSheetId;
    }

    public void setDsSheetId(Long dsSheetId) {
        this.dsSheetId = dsSheetId;
    }

    public DsWorkbook getWorkbook() {
        return workbook;
    }

    public void setWorkbook(DsWorkbook workbook) {
        this.workbook = workbook;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSourceView() {
        return sourceView;
    }

    public void setSourceView(String sourceView) {
        this.sourceView = sourceView;
    }

    public String getSourceFilters() {
        return sourceFilters;
    }

    public void setSourceFilters(String sourceFilters) {
        this.sourceFilters = sourceFilters;
    }

    public String getGrain() {
        return grain;
    }

    public void setGrain(String grain) {
        this.grain = grain;
    }

    public String getDisplayState() {
        return displayState;
    }

    public void setDisplayState(String displayState) {
        this.displayState = displayState;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
