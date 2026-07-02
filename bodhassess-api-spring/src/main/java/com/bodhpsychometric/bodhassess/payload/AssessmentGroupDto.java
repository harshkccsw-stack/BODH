package com.bodhpsychometric.bodhassess.payload;

import java.time.OffsetDateTime;

// One row per assessmentId — the All Assessments table renders these so
// admins see "one assessment with N respondents" rather than N session
// rows. JPQL aggregates (MAX/COUNT/SUM) come back as boxed Long for
// counts, so the constructor parameters need to match exactly.
public class AssessmentGroupDto {
    private String assessmentId;
    private String name;
    private String instrument;
    private String instrumentFullName;
    private String vertical;
    private String language;
    private OffsetDateTime createdAt;
    private Long respondentCount;
    private Long completedCount;
    private Long activeCount;
    private Long pendingReviewCount;

    public AssessmentGroupDto() {}

    public AssessmentGroupDto(String assessmentId,
                              String name, String instrument, String instrumentFullName,
                              String vertical, String language,
                              OffsetDateTime createdAt,
                              Long respondentCount,
                              Long completedCount,
                              Long activeCount,
                              Long pendingReviewCount) {
        this.assessmentId = assessmentId;
        this.name = name;
        this.instrument = instrument;
        this.instrumentFullName = instrumentFullName;
        this.vertical = vertical;
        this.language = language;
        this.createdAt = createdAt;
        this.respondentCount = respondentCount;
        this.completedCount = completedCount;
        this.activeCount = activeCount;
        this.pendingReviewCount = pendingReviewCount;
    }

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getInstrument() { return instrument; }
    public void setInstrument(String instrument) { this.instrument = instrument; }
    public String getInstrumentFullName() { return instrumentFullName; }
    public void setInstrumentFullName(String instrumentFullName) { this.instrumentFullName = instrumentFullName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public Long getRespondentCount() { return respondentCount; }
    public void setRespondentCount(Long respondentCount) { this.respondentCount = respondentCount; }
    public Long getCompletedCount() { return completedCount; }
    public void setCompletedCount(Long completedCount) { this.completedCount = completedCount; }
    public Long getActiveCount() { return activeCount; }
    public void setActiveCount(Long activeCount) { this.activeCount = activeCount; }
    public Long getPendingReviewCount() { return pendingReviewCount; }
    public void setPendingReviewCount(Long pendingReviewCount) { this.pendingReviewCount = pendingReviewCount; }
}
