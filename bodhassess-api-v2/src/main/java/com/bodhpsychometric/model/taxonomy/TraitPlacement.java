package com.bodhpsychometric.model.taxonomy;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.model.base.SoftDeletableEntity;

/**
 * The context edge of the taxonomy: this trait, inside this MQ, under this
 * parent. Every scoring row in the system references a placement — never a
 * bare trait — so a shared trait cannot double-count across MQs.
 *
 * Two rules the mapping cannot express: the parent placement must belong to
 * the same MQ (Flyway adds a composite FK (parentPlacementId,
 * measuredQualityId) → (id, measuredQualityId) at cutover) and the tree must
 * stay acyclic (service check).
 */
@Entity
@Table(name = "TraitPlacement",
        uniqueConstraints = @UniqueConstraint(name = "uqPlacementMqTrait",
                columnNames = {"measuredQualityId", "traitId"}),
        indexes = {
                @Index(name = "idxPlacementMq", columnList = "measuredQualityId"),
                @Index(name = "idxPlacementTrait", columnList = "traitId"),
                @Index(name = "idxPlacementParent", columnList = "parentPlacementId")
        })
public class TraitPlacement extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "measuredQualityId", nullable = false,
            foreignKey = @ForeignKey(name = "fkPlacementMq"))
    private MeasuredQuality measuredQuality;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "traitId", nullable = false,
            foreignKey = @ForeignKey(name = "fkPlacementTrait"))
    private MeasuredQualityTrait trait;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parentPlacementId",
            foreignKey = @ForeignKey(name = "fkPlacementParent"))
    private TraitPlacement parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<TraitPlacement> children = new ArrayList<>();

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public MeasuredQuality getMeasuredQuality() { return measuredQuality; }
    public void setMeasuredQuality(MeasuredQuality measuredQuality) { this.measuredQuality = measuredQuality; }
    public MeasuredQualityTrait getTrait() { return trait; }
    public void setTrait(MeasuredQualityTrait trait) { this.trait = trait; }
    public TraitPlacement getParent() { return parent; }
    public void setParent(TraitPlacement parent) { this.parent = parent; }
    public List<TraitPlacement> getChildren() { return children; }
    public void setChildren(List<TraitPlacement> children) { this.children = children; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }

    public boolean isRoot() { return parent == null; }

    public void addChild(TraitPlacement child) {
        children.add(child);
        child.setParent(this);
        child.setMeasuredQuality(this.measuredQuality);
    }

    public void removeChild(TraitPlacement child) {
        children.remove(child);
        child.setParent(null);
    }
}
