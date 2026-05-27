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
 * Snapshot MQT row attached to a {@link PublishedQuestionnaireMq}. Forms a
 * tree via {@link #parent} (nullable for top-level rows).
 */
@Entity
@Table(name = "published_questionnaire_mqts")
public class PublishedQuestionnaireMqt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pq_mq_id", nullable = false)
    private PublishedQuestionnaireMq mq;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private PublishedQuestionnaireMqt parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<PublishedQuestionnaireMqt> children = new ArrayList<>();

    @Column(name = "mqt_id", nullable = false, length = 64)
    private String mqtId;

    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PublishedQuestionnaireMq getMq() { return mq; }
    public void setMq(PublishedQuestionnaireMq mq) { this.mq = mq; }
    public PublishedQuestionnaireMqt getParent() { return parent; }
    public void setParent(PublishedQuestionnaireMqt parent) { this.parent = parent; }
    public List<PublishedQuestionnaireMqt> getChildren() { return children; }
    public void setChildren(List<PublishedQuestionnaireMqt> children) { this.children = children; }
    public String getMqtId() { return mqtId; }
    public void setMqtId(String mqtId) { this.mqtId = mqtId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
