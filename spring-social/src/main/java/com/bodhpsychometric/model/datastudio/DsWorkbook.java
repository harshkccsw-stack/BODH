package com.bodhpsychometric.model.datastudio;

import java.time.OffsetDateTime;

import com.bodhpsychometric.model.auth.User;

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
 * A Data Studio workbook — one analyst's project. Owned by the dashboard user
 * who created it; other dashboard users are let in through
 * {@link DsWorkbookShare} (EDITOR or VIEWER), and a super admin sees every
 * workbook.
 *
 * <p>Nothing here copies assessment data. A workbook only stores DEFINITIONS
 * — which assessment a sheet is bound to, what formulas were written, how a
 * dashboard is laid out — and every open re-pulls live rows and recomputes.
 * That is what makes a workbook safe to keep indefinitely: it can never go
 * stale against the answers, and it holds no respondent PII of its own.
 *
 * <p>The child collections (sheets, dashboards, shares) are deliberately NOT
 * mapped here. They are read through their repositories instead, so deleting
 * a workbook is an explicit ordered sweep in the service rather than a
 * cascade whose ordering has to dodge the widget → sheet foreign key.
 */
@Entity
@Table(name = "DsWorkbook")
public class DsWorkbook implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long dsWorkbookId;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "description", length = 512)
    private String description;

    /**
     * The dashboard user who created it. A real FK, not a loose id: a workbook
     * whose owner no longer exists has no access rule left, so the FK blocking
     * that delete is the behaviour we want.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ownerUserId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDsWorkbookOwner"))
    private User owner;

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

    public Long getDsWorkbookId() {
        return dsWorkbookId;
    }

    public void setDsWorkbookId(Long dsWorkbookId) {
        this.dsWorkbookId = dsWorkbookId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public User getOwner() {
        return owner;
    }

    public void setOwner(User owner) {
        this.owner = owner;
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
