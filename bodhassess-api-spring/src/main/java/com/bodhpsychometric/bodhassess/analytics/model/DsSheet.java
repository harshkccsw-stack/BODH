package com.bodhpsychometric.bodhassess.analytics.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Index;
import javax.persistence.PrePersist;
import javax.persistence.PreUpdate;
import javax.persistence.Table;

/**
 * A sheet binds a live dataset view (e.g. "sessions") plus optional filters to
 * a set of user-defined derived columns ({@link DsDerivedColumn}) and display
 * state. Data is never copied — every open re-pulls live rows from the dataset
 * service and re-evaluates. {@code sourceFilters} / {@code displayState} hold
 * JSON managed by the service layer.
 */
@Entity
@Table(name = "ds_sheet", indexes = @Index(name = "idx_ds_sheet_workbook", columnList = "workbook_id"))
public class DsSheet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workbook_id", nullable = false)
    private Long workbookId;

    @Column(nullable = false, length = 160)
    private String name;

    /** Matches DatasetResponseDto.view; v1 only "sessions". */
    @Column(name = "source_view", nullable = false, length = 40)
    private String sourceView = "sessions";

    /** JSON object of filters forwarded to the dataset service, e.g. {"entityId":"..."}. */
    @Column(name = "source_filters", columnDefinition = "text")
    private String sourceFilters;

    @Column(nullable = false, length = 24)
    private String grain = "respondent_session";

    /** JSON: column order, widths, hidden, freezes, sort. Opaque to the backend. */
    @Column(name = "display_state", columnDefinition = "text")
    private String displayState;

    @Column(name = "sort_order")
    private Integer sortOrder;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
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

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getWorkbookId() { return workbookId; }
    public void setWorkbookId(Long workbookId) { this.workbookId = workbookId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSourceView() { return sourceView; }
    public void setSourceView(String sourceView) { this.sourceView = sourceView; }
    public String getSourceFilters() { return sourceFilters; }
    public void setSourceFilters(String sourceFilters) { this.sourceFilters = sourceFilters; }
    public String getGrain() { return grain; }
    public void setGrain(String grain) { this.grain = grain; }
    public String getDisplayState() { return displayState; }
    public void setDisplayState(String displayState) { this.displayState = displayState; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
