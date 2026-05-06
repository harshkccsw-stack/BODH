package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonStringType;

@Entity
@Table(name = "measured_qualities")
@TypeDef(name = "json", typeClass = JsonStringType.class)
public class MeasuredQuality {

    @Id
    private String id;

    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Type(type = "json")
    @Column(columnDefinition = "json")
    private List<Mqt> mqts = new ArrayList<>();

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public static class Mqt {
        private String id;
        private String name;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
    }

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
