package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

/**
 * Parent of a versioned questionnaire family. One row per
 * "questionnaire" the admin recognises (PHQ-9, GAD-7, Custom Hiring
 * 2026, …). The actual content lives in {@link PublishedQuestionnaire}
 * rows — each one is an immutable version once committed.
 *
 * Concept of "current version":
 *   - {@code currentVersionId} points at the COMMITTED version that
 *     newly-created Assessments default to.
 *   - Existing Assessments are pinned to whatever version they were
 *     created against; moving this pointer never retroactively affects
 *     them.
 *
 * Vertical/name are cached here for filtering and list views so the
 * Question Bank doesn't have to join the version table just to render
 * a row. They're updated when admin commits a version that changes
 * either.
 */
@Entity
@Table(name = "questionnaires")
public class Questionnaire {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    private String vertical;

    @Column(name = "current_version_id")
    private String currentVersionId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "created_by")
    private String createdBy;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getCurrentVersionId() { return currentVersionId; }
    public void setCurrentVersionId(String currentVersionId) { this.currentVersionId = currentVersionId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
}
