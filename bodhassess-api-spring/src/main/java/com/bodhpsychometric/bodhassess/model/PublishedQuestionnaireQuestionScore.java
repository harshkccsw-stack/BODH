package com.bodhpsychometric.bodhassess.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.Table;
import javax.persistence.UniqueConstraint;

/**
 * Question-level MQT score on a snapshot question. Credited whenever the
 * respondent answers, regardless of which option is picked. Mirrors
 * ItemQuestionScore but for the published_questionnaires snapshot side.
 */
@Entity
@Table(name = "published_questionnaire_question_scores", uniqueConstraints = {
        @UniqueConstraint(name = "uniq_pq_question_mqt", columnNames = {"pq_question_id", "mqt_id"})
})
public class PublishedQuestionnaireQuestionScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pq_question_id", nullable = false)
    private PublishedQuestionnaireQuestion question;

    @Column(name = "mqt_id", nullable = false, length = 64)
    private String mqtId;

    @Column(nullable = false)
    private double score;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PublishedQuestionnaireQuestion getQuestion() { return question; }
    public void setQuestion(PublishedQuestionnaireQuestion question) { this.question = question; }
    public String getMqtId() { return mqtId; }
    public void setMqtId(String mqtId) { this.mqtId = mqtId; }
    public double getScore() { return score; }
    public void setScore(double score) { this.score = score; }
}
