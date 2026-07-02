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
import javax.persistence.Table;

/**
 * Snapshot of a single MCQ option attached to a snapshot question.
 */
@Entity
@Table(name = "published_questionnaire_question_options")
public class PublishedQuestionnaireQuestionOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pq_question_id", nullable = false)
    private PublishedQuestionnaireQuestion question;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(columnDefinition = "text")
    private String text;

    @Column(name = "media_url", columnDefinition = "text")
    private String mediaUrl;

    @Column(name = "media_type", length = 20)
    private String mediaType;

    @OneToMany(mappedBy = "option", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PublishedQuestionnaireQuestionOptionScore> scores = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PublishedQuestionnaireQuestion getQuestion() { return question; }
    public void setQuestion(PublishedQuestionnaireQuestion question) { this.question = question; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public List<PublishedQuestionnaireQuestionOptionScore> getScores() { return scores; }
    public void setScores(List<PublishedQuestionnaireQuestionOptionScore> scores) { this.scores = scores; }
}
