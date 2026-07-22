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
 * A dashboard within a workbook — a canvas of widgets ({@link DsWidget}) over
 * the workbook's data. {@code layout} holds grid metadata (columns, row height)
 * as opaque JSON managed by the service layer.
 */
@Entity
@Table(name = "ds_dashboard", indexes = @Index(name = "idx_ds_dashboard_workbook", columnList = "workbook_id"))
public class DsDashboard {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workbook_id", nullable = false)
    private Long workbookId;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(name = "layout", columnDefinition = "text")
    private String layout;

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
    void onUpdate() { this.updatedAt = OffsetDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getWorkbookId() { return workbookId; }
    public void setWorkbookId(Long workbookId) { this.workbookId = workbookId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLayout() { return layout; }
    public void setLayout(String layout) { this.layout = layout; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
