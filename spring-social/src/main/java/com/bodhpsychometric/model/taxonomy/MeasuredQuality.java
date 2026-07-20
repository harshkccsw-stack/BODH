package com.bodhpsychometric.model.taxonomy;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

/**
 * A measured quality (MQ) — the top-level psychometric construct, e.g.
 * "Cognitive Ability". Its structure lives in {@link MeasuredQualityType}
 * nodes, which form a tree of arbitrary depth under this MQ.
 *
 * The types collection holds ALL of this MQ's nodes, not just the top level —
 * roots are the ones with parent == null. Root-only views are repository
 * queries, not a filtered mapping.
 */
@Entity
@Table(name = "MeasuredQuality")
public class MeasuredQuality implements java.io.Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long measuredQualityId;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * Inverse side of MeasuredQuality 1—* MeasuredQualityType. Nodes live and
     * die with their MQ: cascade ALL + orphanRemoval, the tree is meaningless
     * without its construct.
     */
    @OneToMany(mappedBy = "measuredQuality", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<MeasuredQualityType> types = new ArrayList<>();

    public Long getMeasuredQualityId() {
        return measuredQualityId;
    }

    public void setMeasuredQualityId(Long measuredQualityId) {
        this.measuredQualityId = measuredQualityId;
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

    public List<MeasuredQualityType> getTypes() {
        return types;
    }

    public void setTypes(List<MeasuredQualityType> types) {
        this.types = types;
    }

    /** Keeps both sides of the bidirectional link in sync. */
    public void addType(MeasuredQualityType type) {
        types.add(type);
        type.setMeasuredQuality(this);
    }

    public void removeType(MeasuredQualityType type) {
        types.remove(type);
        type.setMeasuredQuality(null);
    }
}
