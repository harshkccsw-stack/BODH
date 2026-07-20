package com.bodhpsychometric.model.base;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;

/**
 * Recycle-bin semantics: deletedAt != null hides the row from every normal
 * use-case, nothing is ever physically deleted. Subtree bin/restore cascades
 * are a service-layer responsibility; ON DELETE RESTRICT on referencing FKs
 * is the database backstop. No global Hibernate filters — repositories query
 * liveness explicitly.
 */
@MappedSuperclass
public abstract class SoftDeletableEntity extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @Column(name = "deletedAt")
    private OffsetDateTime deletedAt;

    public OffsetDateTime getDeletedAt() { return deletedAt; }
    public void setDeletedAt(OffsetDateTime deletedAt) { this.deletedAt = deletedAt; }

    public boolean isDeleted() { return deletedAt != null; }

    public void moveToBin(OffsetDateTime when) { this.deletedAt = when; }
    public void restoreFromBin() { this.deletedAt = null; }
}
