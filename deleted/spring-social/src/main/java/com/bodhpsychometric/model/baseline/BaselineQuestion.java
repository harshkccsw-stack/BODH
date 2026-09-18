package com.bodhpsychometric.model.baseline;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * One line of the baseline — "I leave things until the last minute." —
 * answered on a fixed five-point scale. Authored on MemoryMesh and mirrored
 * here; see V26 for why this is not a bank question.
 *
 * <p>{@code active} rather than delete: a question someone has answered
 * cannot be removed (the answer would lose its meaning), but it can be
 * retired so nobody new is asked it.
 */
@Entity
@Table(name = "BaselineQuestion")
public class BaselineQuestion implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "baselineQuestionId")
    private Long baselineQuestionId;

    @Column(name = "text", nullable = false, length = 1000)
    private String text;

    /** Server-owned: the array index of the last replace-all. */
    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updatedAt", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public Long getBaselineQuestionId() { return baselineQuestionId; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
