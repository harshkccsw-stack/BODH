package com.bodhpsychometric.model.question;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.model.questionnaire.Section;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "Question")
public class Question implements Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long questionId;

    /**
     * The questionnaire this bank question is currently attached to; null for
     * an unattached question. Questions are created standalone in the question
     * bank — attachment happens during questionnaire authoring, not here.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "questionnaireId",
            foreignKey = @ForeignKey(name = "fkQuestionQuestionnaire"))
    private Questionnaire questionnaire;

    /**
     * Null on flat questionnaires; required by the service when the
     * questionnaire hasSections. Must belong to the same questionnaire —
     * a rule the schema cannot express, enforced in the service.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sectionId",
            foreignKey = @ForeignKey(name = "fkQuestionSection"))
    private Section section;

    /**
     * Inverse side of Question 1—* Option. Options live and die with their
     * question: cascade ALL + orphanRemoval means saving/deleting a question
     * takes its options along, and dropping one from this list deletes it.
     */
    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<Option> options = new ArrayList<>();

    /**
     * What the stem is made of. How the question is attempted (single choice,
     * multiple choice, matrix) is deliberately not modelled yet.
     */
    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "contentType", nullable = false, length = 10)
    private ContentType contentType = ContentType.TEXT;

    @Column(name = "stem", columnDefinition = "TEXT")
    private String questionTexString;

    /** Asset location when contentType is not TEXT: uploaded file path for IMAGE/VIDEO, external link for URL. */
    @Column(name = "mediaUrl", columnDefinition = "TEXT")
    private String mediaUrl;

    /**
     * Position within the attached questionnaire (within its section when the
     * questionnaire hasSections). Null while the question sits unattached in
     * the bank — order is an attachment concern, set by the mapping flow.
     */
    @Column(name = "sortOrder")
    private Integer sortOrder;

    // ── Kept from the old system, to be refined in a later pass ──────────
    @Column(name = "irtA")
    private Double irtA;

    @Column(name = "irtB")
    private Double irtB;

    @Column(name = "irtC")
    private Double irtC;

    @Column(name = "riskFlag", nullable = false)
    private boolean riskFlag;

    @Column(name = "riskRule", columnDefinition = "TEXT")
    private String riskRule;

    @Column(name = "subDomain", length = 150)
    private String subDomain;

    

    public ContentType getContentType() {
        return contentType;
    }

    public void setContentType(ContentType contentType) {
        this.contentType = contentType;
    }

    public String getQuestionTexString() {
        return questionTexString;
    }

    public void setQuestionTexString(String questionTexString) {
        this.questionTexString = questionTexString;
    }

    public String getMediaUrl() {
        return mediaUrl;
    }

    public void setMediaUrl(String mediaUrl) {
        this.mediaUrl = mediaUrl;
    }

    public Double getIrtA() {
        return irtA;
    }

    public void setIrtA(Double irtA) {
        this.irtA = irtA;
    }

    public Double getIrtB() {
        return irtB;
    }

    public void setIrtB(Double irtB) {
        this.irtB = irtB;
    }

    public Double getIrtC() {
        return irtC;
    }

    public void setIrtC(Double irtC) {
        this.irtC = irtC;
    }

    public boolean isRiskFlag() {
        return riskFlag;
    }

    public void setRiskFlag(boolean riskFlag) {
        this.riskFlag = riskFlag;
    }

    public String getRiskRule() {
        return riskRule;
    }

    public void setRiskRule(String riskRule) {
        this.riskRule = riskRule;
    }

    public String getSubDomain() {
        return subDomain;
    }

    public void setSubDomain(String subDomain) {
        this.subDomain = subDomain;
    }

    public static long getSerialversionuid() {
        return serialVersionUID;
    }

    public Long getQuestionId() {
        return questionId;
    }

    public void setQuestionId(Long questionId) {
        this.questionId = questionId;
    }

    public Questionnaire getQuestionnaire() {
        return questionnaire;
    }

    public void setQuestionnaire(Questionnaire questionnaire) {
        this.questionnaire = questionnaire;
    }

    public Section getSection() {
        return section;
    }

    public void setSection(Section section) {
        this.section = section;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public List<Option> getOptions() {
        return options;
    }

    public void setOptions(List<Option> options) {
        this.options = options;
    }

    /** Keeps both sides of the bidirectional link in sync. */
    public void addOption(Option option) {
        options.add(option);
        option.setQuestion(this);
    }

    public void removeOption(Option option) {
        options.remove(option);
        option.setQuestion(null);
    }

    

}