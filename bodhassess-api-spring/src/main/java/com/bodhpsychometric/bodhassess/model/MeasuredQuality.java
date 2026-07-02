package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.CascadeType;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.OneToMany;
import javax.persistence.OrderBy;
import javax.persistence.Table;

import org.hibernate.annotations.Where;

@Entity
@Table(name = "measured_qualities")
public class MeasuredQuality {

    @Id
    private String id;

    private String name;

    @Column(columnDefinition = "text")
    private String description;

    // Top-level MQTs under this MQ. Nested children live on each Mqt row via
    // self-referential parent_mqt_id and are reached through Mqt.getChildren().
    // @Where excludes non-root rows from this collection so the tree isn't
    // returned flattened. Persisting the MQ cascades to the full tree;
    // orphanRemoval deletes any MQT removed from the list.
    @OneToMany(mappedBy = "mq", cascade = CascadeType.ALL, orphanRemoval = true)
    @Where(clause = "parent_mqt_id IS NULL")
    @OrderBy("sortOrder ASC")
    private List<Mqt> mqts = new ArrayList<>();

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<Mqt> getMqts() { return mqts; }
    public void setMqts(List<Mqt> mqts) { this.mqts = mqts; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
