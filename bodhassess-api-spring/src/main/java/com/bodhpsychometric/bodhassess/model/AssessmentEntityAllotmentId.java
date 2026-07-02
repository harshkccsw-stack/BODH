package com.bodhpsychometric.bodhassess.model;

import java.io.Serializable;
import java.util.Objects;

// Composite PK class for AssessmentEntityAllotment. Plain POJO; must
// implement equals/hashCode for JPA to use it as an @IdClass.
public class AssessmentEntityAllotmentId implements Serializable {
    private static final long serialVersionUID = 1L;

    private String assessmentId;
    private String entityId;

    public AssessmentEntityAllotmentId() {}
    public AssessmentEntityAllotmentId(String assessmentId, String entityId) {
        this.assessmentId = assessmentId;
        this.entityId = entityId;
    }

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AssessmentEntityAllotmentId)) return false;
        AssessmentEntityAllotmentId that = (AssessmentEntityAllotmentId) o;
        return Objects.equals(assessmentId, that.assessmentId) && Objects.equals(entityId, that.entityId);
    }
    @Override public int hashCode() { return Objects.hash(assessmentId, entityId); }
}
