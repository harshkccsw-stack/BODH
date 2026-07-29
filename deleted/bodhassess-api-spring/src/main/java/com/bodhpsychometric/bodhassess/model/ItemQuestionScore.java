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
 * Per-MQT score weight applied at the question level (not per option).
 * Replaces the items.sub_domains JSON array of {domain, weight} that the
 * questionnaire builder uses for "question_scores" — credited whenever the
 * respondent answers the question at all.
 */
@Entity
@Table(name = "item_question_scores", uniqueConstraints = {
        @UniqueConstraint(name = "uniq_item_mqt", columnNames = {"item_id", "mqt_id"})
})
public class ItemQuestionScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(name = "mqt_id", nullable = false, length = 64)
    private String mqtId;

    @Column(nullable = false)
    private double score;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Item getItem() { return item; }
    public void setItem(Item item) { this.item = item; }
    public String getMqtId() { return mqtId; }
    public void setMqtId(String mqtId) { this.mqtId = mqtId; }
    public double getScore() { return score; }
    public void setScore(double score) { this.score = score; }
}
