package com.bodhpsychometric.model.assessment;

import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.questionnaire.Questionnaire;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * One "Create Assessment" act — a questionnaire offered under a chosen
 * configuration. Each assessment reads exactly one LIVE questionnaire; the
 * same questionnaire may back many assessments, so the FK sits here.
 */
@Entity
@Table(name = "Assessment",
        indexes = @Index(name = "idxAssessmentQuestionnaire", columnList = "questionnaireId"))
public class Assessment implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long assessmentId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAssessmentQuestionnaire"))
    private Questionnaire questionnaire;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "showTermsAndConditions", nullable = false)
    private boolean showTermsAndConditions = true;

    // ── Config settings ──────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AssessmentStatus status = AssessmentStatus.INACTIVE;

    // Portal UX: auto-advance to the next question right after an option is
    // selected.
    @Column(name = "autoNext", nullable = false)
    private boolean autoNext;

    public Long getAssessmentId() {
        return assessmentId;
    }

    public void setAssessmentId(Long assessmentId) {
        this.assessmentId = assessmentId;
    }

    public Questionnaire getQuestionnaire() {
        return questionnaire;
    }

    public void setQuestionnaire(Questionnaire questionnaire) {
        this.questionnaire = questionnaire;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean isShowTermsAndConditions() {
        return showTermsAndConditions;
    }

    public void setShowTermsAndConditions(boolean showTermsAndConditions) {
        this.showTermsAndConditions = showTermsAndConditions;
    }

    public AssessmentStatus getStatus() {
        return status;
    }

    public void setStatus(AssessmentStatus status) {
        this.status = status;
    }

    public boolean isAutoNext() {
        return autoNext;
    }

    public void setAutoNext(boolean autoNext) {
        this.autoNext = autoNext;
    }
}
