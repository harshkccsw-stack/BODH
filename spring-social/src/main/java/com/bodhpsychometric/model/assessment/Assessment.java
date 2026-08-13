package com.bodhpsychometric.model.assessment;

import java.time.LocalDate;

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

    // The consent text shown before the attempt, as a small, fixed subset of
    // HTML (see AssessmentTerms) authored in the dashboard's editor. NULL on
    // assessments created before the field existed — readers substitute
    // AssessmentTerms.DEFAULT_HTML rather than showing an empty gate, so this
    // is never the reason a respondent sees a blank consent screen.
    @Column(name = "termsAndConditions", columnDefinition = "TEXT")
    private String termsAndConditions;

    // ── Config settings ──────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AssessmentStatus status = AssessmentStatus.INACTIVE;

    // Portal UX: auto-advance to the next question right after an option is
    // selected.
    @Column(name = "autoNext", nullable = false)
    private boolean autoNext;

    // Portal UX: show the question index/navigator panel (jump between
    // questions) during the attempt. Defaults true — the panel was always
    // shown before this became configurable.
    @Column(name = "showQuestionIndex", nullable = false)
    private boolean showQuestionIndex = true;

    // Availability window, both nullable ("no window"). METADATA ONLY today:
    // nothing gates on these — only status == ACTIVE does (see
    // PortalAssessmentService#requireOwnAttempt). Whoever wires enforcement
    // must decide what an in-flight attempt does when the window closes.
    @Column(name = "startDate")
    private LocalDate startDate;

    @Column(name = "endDate")
    private LocalDate endDate;

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

    public String getTermsAndConditions() {
        return termsAndConditions;
    }

    public void setTermsAndConditions(String termsAndConditions) {
        this.termsAndConditions = termsAndConditions;
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

    public boolean isShowQuestionIndex() {
        return showQuestionIndex;
    }

    public void setShowQuestionIndex(boolean showQuestionIndex) {
        this.showQuestionIndex = showQuestionIndex;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
    }
}
