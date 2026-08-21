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
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Co-ownership: one dashboard user let into someone else's workbook. EDITOR
 * may change everything the owner can except the share list itself; VIEWER
 * reads and runs queries but writes nothing.
 *
 * <p>Granting is the owner's (or a super admin's) act alone — an EDITOR
 * cannot re-share, which keeps the reachable set of a workbook to what the
 * owner actually decided.
 *
 * <p>The unique key is what stops a second grant to the same person silently
 * shadowing the first with a different role; the service pre-checks it and
 * updates the existing row instead.
 */
@Entity
@Table(name = "DsWorkbookShare",
        uniqueConstraints = @UniqueConstraint(name = "uqDsShareWorkbookUser",
                columnNames = {"dsWorkbookId", "sharedWithUserId"}))
public class DsWorkbookShare implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    public static final String ROLE_EDITOR = "EDITOR";
    public static final String ROLE_VIEWER = "VIEWER";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long dsWorkbookShareId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dsWorkbookId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDsShareWorkbook"))
    private DsWorkbook workbook;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sharedWithUserId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDsShareUser"))
    private User sharedWith;

    @Column(name = "role", nullable = false, length = 12)
    private String role = ROLE_EDITOR;

    /**
     * Who granted it, as an id rather than a relation: this is a record of an
     * act, and it must survive that account being removed the same way an
     * activity row does.
     */
    @Column(name = "grantedByUserId", nullable = false)
    private Long grantedByUserId;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = OffsetDateTime.now();
    }

    public Long getDsWorkbookShareId() {
        return dsWorkbookShareId;
    }

    public void setDsWorkbookShareId(Long dsWorkbookShareId) {
        this.dsWorkbookShareId = dsWorkbookShareId;
    }

    public DsWorkbook getWorkbook() {
        return workbook;
    }

    public void setWorkbook(DsWorkbook workbook) {
        this.workbook = workbook;
    }

    public User getSharedWith() {
        return sharedWith;
    }

    public void setSharedWith(User sharedWith) {
        this.sharedWith = sharedWith;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public Long getGrantedByUserId() {
        return grantedByUserId;
    }

    public void setGrantedByUserId(Long grantedByUserId) {
        this.grantedByUserId = grantedByUserId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
