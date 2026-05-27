package com.bodhpsychometric.bodhassess.model;

import java.util.ArrayList;
import java.util.List;

import javax.persistence.CascadeType;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.OneToMany;
import javax.persistence.OrderBy;
import javax.persistence.Table;

/**
 * Measured Quality Trait — a leaf or branch under a {@link MeasuredQuality}.
 * MQTs form a tree: each row points at its parent MQT (nullable for top-level
 * traits) and at its owning MQ.
 */
@Entity
@Table(name = "mqts")
public class Mqt {

    @Id
    @Column(length = 64)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mq_id", nullable = false)
    private MeasuredQuality mq;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_mqt_id")
    private Mqt parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<Mqt> children = new ArrayList<>();

    @Column(nullable = false)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public MeasuredQuality getMq() { return mq; }
    public void setMq(MeasuredQuality mq) { this.mq = mq; }
    public Mqt getParent() { return parent; }
    public void setParent(Mqt parent) { this.parent = parent; }
    public List<Mqt> getChildren() { return children; }
    public void setChildren(List<Mqt> children) { this.children = children; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
