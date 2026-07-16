package com.bodhpsychometric.bodhassess.domain.assessment;

import java.util.HashSet;
import java.util.Set;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.base.SoftDeletableEntity;
import com.bodhpsychometric.bodhassess.domain.questionnaire.Questionnaire;

/**
 * One "Create Assessment" act — a questionnaire offered to a set of allottees.
 * Reads the LIVE questionnaire (versioning was removed; the change log covers
 * accountability, and attempts freeze their computed scores at submit).
 * Creator is the inherited createdBy.
 */
@Entity
@Table(name = "Assessment",
        indexes = @Index(name = "idxAssessmentQuestionnaire", columnList = "questionnaireId"))
public class Assessment extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAssessmentQuestionnaire"))
    private Questionnaire questionnaire;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AssessmentStatus status = AssessmentStatus.ACTIVE;

    // Portal UX: auto-advance to the next question right after an option is
    // selected. Single source of truth here; sessions surface it via DTO.
    @Column(name = "autoNext", nullable = false)
    private boolean autoNext;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "AssessmentLanguage",
            joinColumns = @JoinColumn(name = "assessmentId",
                    foreignKey = @ForeignKey(name = "fkAssessmentLanguageAssessment")))
    @Column(name = "language", nullable = false, length = 8)
    private Set<String> languages = new HashSet<>();

    public Questionnaire getQuestionnaire() { return questionnaire; }
    public void setQuestionnaire(Questionnaire questionnaire) { this.questionnaire = questionnaire; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public AssessmentStatus getStatus() { return status; }
    public void setStatus(AssessmentStatus status) { this.status = status; }
    public boolean isAutoNext() { return autoNext; }
    public void setAutoNext(boolean autoNext) { this.autoNext = autoNext; }
    public Set<String> getLanguages() { return languages; }
    public void setLanguages(Set<String> languages) { this.languages = languages; }
}
