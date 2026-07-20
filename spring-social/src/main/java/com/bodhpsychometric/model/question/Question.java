package com.bodhpsychometric.model.question;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.questionnaire.Questionnaire;

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
     * Owning side of Questionnaire 1—* Question: the FK column lives here.
     * Every question belongs to exactly one questionnaire.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQuestionQuestionnaire"))
    private Questionnaire questionnaire;

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