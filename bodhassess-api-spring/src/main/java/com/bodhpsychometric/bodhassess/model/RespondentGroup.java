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
@Table(name = "respondent_groups")
@TypeDef(name = "json", typeClass = JsonStringType.class)
public class RespondentGroup {

    @Id
    private String id;

    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "parent_id")
    private String parentId;

    @Type(type = "json")
    @Column(name = "member_ids", columnDefinition = "json")
    private List<String> memberIds = new ArrayList<>();

    @Type(type = "json")
    @Column(name = "assigned_instruments", columnDefinition = "json")
    private List<String> assignedInstruments = new ArrayList<>();

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
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    public List<String> getMemberIds() { return memberIds; }
    public void setMemberIds(List<String> memberIds) { this.memberIds = memberIds; }
    public List<String> getAssignedInstruments() { return assignedInstruments; }
    public void setAssignedInstruments(List<String> assignedInstruments) { this.assignedInstruments = assignedInstruments; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
