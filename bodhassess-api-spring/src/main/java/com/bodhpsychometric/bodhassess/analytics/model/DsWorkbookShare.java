package com.bodhpsychometric.bodhassess.analytics.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Index;
import javax.persistence.PrePersist;
import javax.persistence.Table;
import javax.persistence.UniqueConstraint;

/**
 * Co-ownership grant: gives another psychometric expert access to a workbook.
 * Role EDITOR allows full edit; VIEWER is read-only. The access check on every
 * workbook/sheet route is {@code owner_id == principal.id} OR an active grant.
 */
@Entity
@Table(name = "ds_workbook_share",
        uniqueConstraints = @UniqueConstraint(name = "uniq_ds_share_wb_user",
                columnNames = {"workbook_id", "shared_with_user_id"}),
        indexes = @Index(name = "idx_ds_share_user", columnList = "shared_with_user_id"))
public class DsWorkbookShare {

    public static final String ROLE_EDITOR = "EDITOR";
    public static final String ROLE_VIEWER = "VIEWER";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workbook_id", nullable = false)
    private Long workbookId;

    @Column(name = "shared_with_user_id", nullable = false, length = 64)
    private String sharedWithUserId;

    @Column(nullable = false, length = 12)
    private String role = ROLE_EDITOR;

    @Column(name = "granted_by", nullable = false, length = 64)
    private String grantedBy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getWorkbookId() { return workbookId; }
    public void setWorkbookId(Long workbookId) { this.workbookId = workbookId; }
    public String getSharedWithUserId() { return sharedWithUserId; }
    public void setSharedWithUserId(String sharedWithUserId) { this.sharedWithUserId = sharedWithUserId; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getGrantedBy() { return grantedBy; }
    public void setGrantedBy(String grantedBy) { this.grantedBy = grantedBy; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
