package com.bodhpsychometric.model.base;

import java.io.Serializable;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Version;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import com.bodhpsychometric.model.auth.User;

/**
 * Root of every table in the new model: surrogate BIGINT identity, optimistic
 * locking, Hibernate-managed timestamps, and Spring-Data-audited provenance
 * (createdBy/updatedBy are filled from the authenticated user on every
 * insert/update via an AuditorAware bean — services never set them by hand).
 *
 * The provenance FKs are left unnamed here: an explicit @ForeignKey name in a
 * @MappedSuperclass would collide across subclass tables; Flyway names them
 * per table at cutover.
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @CreationTimestamp
    @Column(name = "createdAt", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt", nullable = false)
    private OffsetDateTime updatedAt;

    @CreatedBy
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "createdById", updatable = false)
    private User createdBy;

    @LastModifiedBy
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updatedById")
    private User updatedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public User getCreatedBy() { return createdBy; }
    public void setCreatedBy(User createdBy) { this.createdBy = createdBy; }
    public User getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(User updatedBy) { this.updatedBy = updatedBy; }

    /** Id-based identity: unsaved entities are equal only to themselves. */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof BaseEntity)) return false;
        BaseEntity that = (BaseEntity) o;
        return id != null && id.equals(that.getId()) && getClass() == that.getClass();
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
