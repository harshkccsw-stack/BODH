package com.bodhpsychometric.model.taxonomy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import com.bodhpsychometric.model.base.SoftDeletableEntity;

/**
 * Pure library node, shared across MQs: no parent, no MQ link — context comes
 * from {@link TraitPlacement}. Names are deliberately NOT unique (product
 * choice). Soft-delete keeps historical score rows labelled forever.
 */
@Entity
@Table(name = "MeasuredQualityTrait")
public class MeasuredQualityTrait extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
