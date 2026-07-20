package com.bodhpsychometric.model.assessment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.model.auth.unnecessary.RespondentGroup;
import com.bodhpsychometric.model.base.BaseEntity;

/**
 * Allots an assessment to a respondent group. Carries a cap now (new vs the
 * old system, per product decision) with the same completed-sessions
 * semantics as the organization allotment.
 */
@Entity
@Table(name = "AssessmentGroupAllotment",
        uniqueConstraints = @UniqueConstraint(name = "uqAllotAssessmentGroup",
                columnNames = {"assessmentId", "groupId"}),
        indexes = @Index(name = "idxAllotGroupGroup", columnList = "groupId"))
public class AssessmentGroupAllotment extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAllotGroupAssessment"))
    private Assessment assessment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "groupId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAllotGroupGroup"))
    private RespondentGroup group;

    @Column(name = "cap")
    private Integer cap;

    public Assessment getAssessment() { return assessment; }
    public void setAssessment(Assessment assessment) { this.assessment = assessment; }
    public RespondentGroup getGroup() { return group; }
    public void setGroup(RespondentGroup group) { this.group = group; }
    public Integer getCap() { return cap; }
    public void setCap(Integer cap) { this.cap = cap; }
}
