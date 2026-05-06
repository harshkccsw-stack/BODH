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
@Table(name = "roles")
@TypeDef(name = "json", typeClass = JsonStringType.class)
public class Role {

    @Id
    private String id;

    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Type(type = "json")
    @Column(name = "url_paths", columnDefinition = "json")
    private List<String> urlPaths = new ArrayList<>();

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
    public List<String> getUrlPaths() { return urlPaths; }
    public void setUrlPaths(List<String> urlPaths) { this.urlPaths = urlPaths; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
