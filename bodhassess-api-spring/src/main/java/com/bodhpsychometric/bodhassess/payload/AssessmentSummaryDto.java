package com.bodhpsychometric.bodhassess.payload;

import java.time.OffsetDateTime;

// Lightweight projection used by the dashboard's "Recent Assessments" table
// and any other read-only list view. Skips answers, mqtScores, and
// demographics so a 10K-session table doesn't have to fetch the child
// collections just to render rows.
public class AssessmentSummaryDto {
    private String id;
    private String assessmentId;
    private String name;
    private String respondentName;
    private String instrument;
    private String vertical;
    private String status;
    private String score;
    private OffsetDateTime createdAt;
    private OffsetDateTime completedAt;

    public AssessmentSummaryDto() {}

    // JPQL constructor expression target. Order + types must match the
    // SELECT list in the repository query exactly.
    public AssessmentSummaryDto(String id, String assessmentId, String name, String respondentName, String instrument,
                                String vertical, String status, String score, OffsetDateTime createdAt,
                                OffsetDateTime completedAt) {
        this.id = id;
        this.assessmentId = assessmentId;
        this.name = name;
        this.respondentName = respondentName;
        this.instrument = instrument;
        this.vertical = vertical;
        this.status = status;
        this.score = score;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRespondentName() { return respondentName; }
    public void setRespondentName(String respondentName) { this.respondentName = respondentName; }
    public String getInstrument() { return instrument; }
    public void setInstrument(String instrument) { this.instrument = instrument; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getScore() { return score; }
    public void setScore(String score) { this.score = score; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
}
