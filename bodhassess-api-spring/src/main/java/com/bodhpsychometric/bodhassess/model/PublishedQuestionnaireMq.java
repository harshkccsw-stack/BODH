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

import org.hibernate.annotations.Where;

/**
 * Snapshot of an MQ as it appeared at publish time. Replaces the top-level
 * entries of the legacy published_questionnaires.mqs JSON array. Top-level
 * MQTs hang off this row via {@link #mqts}; nested children sit under each
 * MQT in the same table via self-FK parent_id.
 */
@Entity
@Table(name = "published_questionnaire_mqs")
public class PublishedQuestionnaireMq {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "questionnaire_id", nullable = false)
    private PublishedQuestionnaire questionnaire;

    // The snapshot mq id from the publish payload (the live MeasuredQuality
    // id at the time). Kept as a plain varchar — no FK because the upstream
    // row may move/rename without invalidating the snapshot.
    @Column(name = "mq_id", nullable = false, length = 64)
    private String mqId;

    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    // Only the top-level MQTs under this MQ — children are reached through
    // each PublishedQuestionnaireMqt's own children collection.
    @OneToMany(mappedBy = "mq", cascade = CascadeType.ALL, orphanRemoval = true)
    @Where(clause = "parent_id IS NULL")
    @OrderBy("sortOrder ASC")
    private List<PublishedQuestionnaireMqt> mqts = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PublishedQuestionnaire getQuestionnaire() { return questionnaire; }
    public void setQuestionnaire(PublishedQuestionnaire questionnaire) { this.questionnaire = questionnaire; }
    public String getMqId() { return mqId; }
    public void setMqId(String mqId) { this.mqId = mqId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public List<PublishedQuestionnaireMqt> getMqts() { return mqts; }
    public void setMqts(List<PublishedQuestionnaireMqt> mqts) { this.mqts = mqts; }
}
