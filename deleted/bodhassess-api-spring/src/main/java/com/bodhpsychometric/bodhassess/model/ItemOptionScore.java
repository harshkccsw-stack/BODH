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
 * Per-MQT score weight on a single {@link ItemOption}. Was a nested
 * {mqt_id, score} entry in the option's `scores` JSON array.
 */
@Entity
@Table(name = "item_option_scores", uniqueConstraints = {
        @UniqueConstraint(name = "uniq_option_mqt", columnNames = {"option_id", "mqt_id"})
})
public class ItemOptionScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "option_id", nullable = false)
    private ItemOption option;

    @Column(name = "mqt_id", nullable = false, length = 64)
    private String mqtId;

    @Column(nullable = false)
    private double score;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ItemOption getOption() { return option; }
    public void setOption(ItemOption option) { this.option = option; }
    public String getMqtId() { return mqtId; }
    public void setMqtId(String mqtId) { this.mqtId = mqtId; }
    public double getScore() { return score; }
    public void setScore(double score) { this.score = score; }
}
