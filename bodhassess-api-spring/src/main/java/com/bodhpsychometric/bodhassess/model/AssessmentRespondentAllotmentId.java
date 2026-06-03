package com.bodhpsychometric.bodhassess.model;

import java.io.Serializable;
import java.util.Objects;

public class AssessmentRespondentAllotmentId implements Serializable {
    private static final long serialVersionUID = 1L;

    private String assessmentId;
    private String respondentId;

    public AssessmentRespondentAllotmentId() {}
    public AssessmentRespondentAllotmentId(String assessmentId, String respondentId) {
        this.assessmentId = assessmentId;
        this.respondentId = respondentId;
    }

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AssessmentRespondentAllotmentId)) return false;
        AssessmentRespondentAllotmentId that = (AssessmentRespondentAllotmentId) o;
        return Objects.equals(assessmentId, that.assessmentId) && Objects.equals(respondentId, that.respondentId);
    }
    @Override public int hashCode() { return Objects.hash(assessmentId, respondentId); }
}
