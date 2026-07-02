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
 * Per-MQT score weight on a snapshot option. Mirrors ItemOptionScore but
 * for the published_questionnaires snapshot side.
 */
@Entity
@Table(name = "published_questionnaire_question_option_scores", uniqueConstraints = {
        @UniqueConstraint(name = "uniq_pq_option_mqt", columnNames = {"pq_option_id", "mqt_id"})
})
public class PublishedQuestionnaireQuestionOptionScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pq_option_id", nullable = false)
    private PublishedQuestionnaireQuestionOption option;

    @Column(name = "mqt_id", nullable = false, length = 64)
    private String mqtId;

    @Column(nullable = false)
    private double score;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PublishedQuestionnaireQuestionOption getOption() { return option; }
    public void setOption(PublishedQuestionnaireQuestionOption option) { this.option = option; }
    public String getMqtId() { return mqtId; }
    public void setMqtId(String mqtId) { this.mqtId = mqtId; }
    public double getScore() { return score; }
    public void setScore(double score) { this.score = score; }
}
