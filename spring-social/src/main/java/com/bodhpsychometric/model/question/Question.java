package com.bodhpsychometric.model.question;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.SelectionRule;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
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

    // Pure bank item: which questionnaires use this question — and where —
    // lives in QuestionnaireQuestion rows, never on this table. A question
    // may appear in many questionnaires, once each.

    /**
     * Inverse side of Question 1—* Option. Options live and die with their
     * question: cascade ALL + orphanRemoval means saving/deleting a question
     * takes its options along, and dropping one from this list deletes it.
     */
    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<Option> options = new ArrayList<>();

    /** What the stem is made of. */
    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "contentType", nullable = false, length = 10)
    private ContentType contentType = ContentType.TEXT;

    /**
     * How many options the respondent may pick, with {@link #selectionCount}:
     * MIN/MAX/EQUALS n. NULL — with a NULL count, the two are always set or
     * cleared together — is single choice, which is what every question meant
     * before this existed and what every existing row still says.
     *
     * Turn the pair into a floor and a cap with {@link SelectionBounds}; never
     * interpret the rule in place. Free-text and ranking answers are a
     * different axis (payload shape, not cardinality) and will get their own
     * field — AssessmentAnswer already reserves answerText and rankOrder.
     */
    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "selectionRule", length = 10)
    private SelectionRule selectionRule;

    /** The n in the rule; null exactly when selectionRule is null. */
    @Column(name = "selectionCount")
    private Integer selectionCount;

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

    public SelectionRule getSelectionRule() {
        return selectionRule;
    }

    public void setSelectionRule(SelectionRule selectionRule) {
        this.selectionRule = selectionRule;
    }

    public Integer getSelectionCount() {
        return selectionCount;
    }

    public void setSelectionCount(Integer selectionCount) {
        this.selectionCount = selectionCount;
    }

    /** True when the question takes more than one option. */
    public boolean isMultiSelect() {
        return selectionRule != null;
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