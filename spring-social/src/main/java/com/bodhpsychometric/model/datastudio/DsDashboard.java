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
 * A dashboard inside a workbook — a canvas of {@link DsWidget}s over the
 * workbook's sheets. {@code layout} holds grid metadata (column count, row
 * height) as opaque JSON; the placement of an individual widget lives on the
 * widget, not here.
 */
@Entity
@Table(name = "DsDashboard")
public class DsDashboard implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long dsDashboardId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dsWorkbookId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDsDashboardWorkbook"))
    private DsWorkbook workbook;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "layout", columnDefinition = "TEXT")
    private String layout;

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

    public Long getDsDashboardId() {
        return dsDashboardId;
    }

    public void setDsDashboardId(Long dsDashboardId) {
        this.dsDashboardId = dsDashboardId;
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

    public String getLayout() {
        return layout;
    }

    public void setLayout(String layout) {
        this.layout = layout;
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
