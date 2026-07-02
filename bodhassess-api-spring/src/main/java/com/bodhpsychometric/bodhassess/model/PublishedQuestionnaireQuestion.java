package com.bodhpsychometric.bodhassess.model;

import java.util.ArrayList;
import java.util.List;

import javax.persistence.CascadeType;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.OneToMany;
import javax.persistence.OrderBy;
import javax.persistence.Table;

/**
 * Snapshot of a single question on a {@link PublishedQuestionnaire}.
 * Replaces one entry of the legacy questions JSON array.
 */
@Entity
@Table(name = "published_questionnaire_questions")
public class PublishedQuestionnaireQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "questionnaire_id", nullable = false)
    private PublishedQuestionnaire questionnaire;

    // Author-supplied stable id from the publish payload — usually a UUID.
    // Kept so the respondent portal can match answers back to questions.
    @Column(name = "snapshot_question_id", nullable = false, length = 64)
    private String snapshotQuestionId;

    @Column(columnDefinition = "text")
    private String stem;

    @Column(length = 32)
    private String format;

    @Column(name = "media_url", columnDefinition = "text")
    private String mediaUrl;

    @Column(name = "media_type", length = 20)
    private String mediaType;

    @Column(name = "clinical_risk_flag", nullable = false)
    private boolean clinicalRiskFlag;

    @Column(name = "risk_flag_rule", columnDefinition = "text")
    private String riskFlagRule;

    @Column(name = "section_id", length = 64)
    private String sectionId;

    @Column(name = "section_title")
    private String sectionTitle;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<PublishedQuestionnaireQuestionOption> options = new ArrayList<>();

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PublishedQuestionnaireQuestionScore> questionScores = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PublishedQuestionnaire getQuestionnaire() { return questionnaire; }
    public void setQuestionnaire(PublishedQuestionnaire questionnaire) { this.questionnaire = questionnaire; }
    public String getSnapshotQuestionId() { return snapshotQuestionId; }
    public void setSnapshotQuestionId(String snapshotQuestionId) { this.snapshotQuestionId = snapshotQuestionId; }
    public String getStem() { return stem; }
    public void setStem(String stem) { this.stem = stem; }
    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public boolean isClinicalRiskFlag() { return clinicalRiskFlag; }
    public void setClinicalRiskFlag(boolean clinicalRiskFlag) { this.clinicalRiskFlag = clinicalRiskFlag; }
    public String getRiskFlagRule() { return riskFlagRule; }
    public void setRiskFlagRule(String riskFlagRule) { this.riskFlagRule = riskFlagRule; }
    public String getSectionId() { return sectionId; }
    public void setSectionId(String sectionId) { this.sectionId = sectionId; }
    public String getSectionTitle() { return sectionTitle; }
    public void setSectionTitle(String sectionTitle) { this.sectionTitle = sectionTitle; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public List<PublishedQuestionnaireQuestionOption> getOptions() { return options; }
    public void setOptions(List<PublishedQuestionnaireQuestionOption> options) { this.options = options; }
    public List<PublishedQuestionnaireQuestionScore> getQuestionScores() { return questionScores; }
    public void setQuestionScores(List<PublishedQuestionnaireQuestionScore> questionScores) { this.questionScores = questionScores; }
}
