package com.bodhpsychometric.model.taxonomy;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

/**
 * A node in an MQ's structure tree — "Verbal", under it "Vocabulary", to any
 * depth. Every node belongs to exactly one {@link MeasuredQuality}; parent
 * builds the tree, and parent == null marks a root.
 *
 * Names are deliberately not unique: "Attention" may appear under several
 * MQs or branches. Two rules the mapping cannot express, enforce in the
 * service layer: the parent must belong to the same MQ, and the tree must
 * stay acyclic.
 */
@Entity
@Table(name = "MeasuredQualityType",
        indexes = {
                @Index(name = "idxMqtMeasuredQuality", columnList = "measuredQualityId"),
                @Index(name = "idxMqtParent", columnList = "parentTypeId")
        })
public class MeasuredQualityType implements java.io.Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long measuredQualityTypeId;

    /** Owning side of MeasuredQuality 1—* MeasuredQualityType: the FK lives here. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "measuredQualityId", nullable = false,
            foreignKey = @ForeignKey(name = "fkMqtMeasuredQuality"))
    private MeasuredQuality measuredQuality;

    /** Self-reference that builds the depth tree; null for root nodes. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parentTypeId",
            foreignKey = @ForeignKey(name = "fkMqtParent"))
    private MeasuredQualityType parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<MeasuredQualityType> children = new ArrayList<>();

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getMeasuredQualityTypeId() {
        return measuredQualityTypeId;
    }

    public void setMeasuredQualityTypeId(Long measuredQualityTypeId) {
        this.measuredQualityTypeId = measuredQualityTypeId;
    }

    public MeasuredQuality getMeasuredQuality() {
        return measuredQuality;
    }

    public void setMeasuredQuality(MeasuredQuality measuredQuality) {
        this.measuredQuality = measuredQuality;
    }

    public MeasuredQualityType getParent() {
        return parent;
    }

    public void setParent(MeasuredQualityType parent) {
        this.parent = parent;
    }

    public List<MeasuredQualityType> getChildren() {
        return children;
    }

    public void setChildren(List<MeasuredQualityType> children) {
        this.children = children;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public boolean isRoot() {
        return parent == null;
    }

    /**
     * Keeps both sides in sync and pins the child to this node's MQ, so the
     * same-MQ rule cannot be broken through this path.
     */
    public void addChild(MeasuredQualityType child) {
        children.add(child);
        child.setParent(this);
        child.setMeasuredQuality(this.measuredQuality);
    }

    public void removeChild(MeasuredQualityType child) {
        children.remove(child);
        child.setParent(null);
    }
}
