package com.bodhpsychometric.model.questionnaire;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * A named group of questions inside a sectioned questionnaire ("Verbal",
 * "Numerical"). Only meaningful when the questionnaire's hasSections flag is
 * on; display order is the editable sortOrder (it was insertion order until
 * V13, which backfilled sortOrder from it). Deliberately no cascade
 * anywhere: deleting a section never deletes questions — the service must
 * detach them first, and the question FK will refuse otherwise.
 */
@Entity
@Table(name = "Section",
        indexes = @Index(name = "idxSectionQuestionnaire", columnList = "questionnaireId"))
public class Section implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long sectionId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkSectionQuestionnaire"))
    private Questionnaire questionnaire;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** Shown above the section's questions; the per-section counterpart of generalInstruction. */
    @Column(name = "instruction", columnDefinition = "TEXT")
    private String instruction;

    /**
     * Display order within the questionnaire, 0-based and dense. The
     * controller owns it end to end — create appends, reorder renumbers,
     * delete compacts — so the sequence never gains a hole a client would
     * have to reason about. Ties fall back to sectionId.
     */
    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getSectionId() {
        return sectionId;
    }

    public void setSectionId(Long sectionId) {
        this.sectionId = sectionId;
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

    public String getInstruction() {
        return instruction;
    }

    public void setInstruction(String instruction) {
        this.instruction = instruction;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
