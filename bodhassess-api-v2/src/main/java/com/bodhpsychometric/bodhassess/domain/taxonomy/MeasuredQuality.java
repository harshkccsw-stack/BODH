package com.bodhpsychometric.bodhassess.domain.taxonomy;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.base.SoftDeletableEntity;

/**
 * A measured quality (MQ) — the top-level psychometric construct. Its per-MQ
 * trait tree lives entirely in {@link TraitPlacement} rows; the placements
 * collection here holds ALL of this MQ's placements (roots have
 * parent == null) — root-only views are repository queries, not a filtered
 * mapping, so this compiles against both Hibernate 5 (pre-cutover) and 6.
 */
@Entity
@Table(name = "MeasuredQuality")
public class MeasuredQuality extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @OneToMany(mappedBy = "measuredQuality", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<TraitPlacement> placements = new ArrayList<>();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<TraitPlacement> getPlacements() { return placements; }
    public void setPlacements(List<TraitPlacement> placements) { this.placements = placements; }

    public void addPlacement(TraitPlacement placement) {
        placements.add(placement);
        placement.setMeasuredQuality(this);
    }

    public void removePlacement(TraitPlacement placement) {
        placements.remove(placement);
        placement.setMeasuredQuality(null);
    }
}
