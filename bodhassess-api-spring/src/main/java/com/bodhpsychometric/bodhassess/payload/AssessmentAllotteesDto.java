package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

/**
 * Aggregated view of all allotees for one assessment — drives the
 * "Allotees" popup on the All Assessments table. One round-trip returns
 * the three lists fully populated with display info.
 */
public class AssessmentAllotteesDto {
    private String assessmentId;
    private List<AssessmentEntityAllotmentDto>     entities     = new ArrayList<>();
    private List<AssessmentGroupAllotmentDto>      groups       = new ArrayList<>();
    private List<AssessmentRespondentAllotmentDto> respondents  = new ArrayList<>();

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public List<AssessmentEntityAllotmentDto> getEntities() { return entities; }
    public void setEntities(List<AssessmentEntityAllotmentDto> entities) { this.entities = entities; }
    public List<AssessmentGroupAllotmentDto> getGroups() { return groups; }
    public void setGroups(List<AssessmentGroupAllotmentDto> groups) { this.groups = groups; }
    public List<AssessmentRespondentAllotmentDto> getRespondents() { return respondents; }
    public void setRespondents(List<AssessmentRespondentAllotmentDto> respondents) { this.respondents = respondents; }
}
