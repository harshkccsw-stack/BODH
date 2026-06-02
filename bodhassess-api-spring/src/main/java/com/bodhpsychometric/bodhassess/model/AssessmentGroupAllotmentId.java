package com.bodhpsychometric.bodhassess.model;

import java.io.Serializable;
import java.util.Objects;

public class AssessmentGroupAllotmentId implements Serializable {
    private static final long serialVersionUID = 1L;

    private String assessmentId;
    private String groupId;

    public AssessmentGroupAllotmentId() {}
    public AssessmentGroupAllotmentId(String assessmentId, String groupId) {
        this.assessmentId = assessmentId;
        this.groupId = groupId;
    }

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AssessmentGroupAllotmentId)) return false;
        AssessmentGroupAllotmentId that = (AssessmentGroupAllotmentId) o;
        return Objects.equals(assessmentId, that.assessmentId) && Objects.equals(groupId, that.groupId);
    }
    @Override public int hashCode() { return Objects.hash(assessmentId, groupId); }
}
