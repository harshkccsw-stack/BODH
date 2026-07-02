package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;

import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.Table;

@Entity
@Table(name = "respondent_groups")
public class RespondentGroup {

    @Id
    private String id;

    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "parent_id")
    private String parentId;

    // Memberships live in dedicated join tables so cross-group queries
    // ("which groups contain respondent X", "which groups have instrument Y
    // assigned") become real SQL instead of JSON_CONTAINS scans. Set (not
    // List) avoids Hibernate's MultipleBagFetchException for two eager
    // collections on one entity.
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "respondent_group_members",
            joinColumns = @JoinColumn(name = "group_id"))
    @Column(name = "respondent_id", nullable = false, length = 64)
    private Set<String> memberIds = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "respondent_group_instruments",
            joinColumns = @JoinColumn(name = "group_id"))
    @Column(name = "instrument_id", nullable = false, length = 64)
    private Set<String> assignedInstruments = new HashSet<>();

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
    public Set<String> getMemberIds() { return memberIds; }
    public void setMemberIds(Set<String> memberIds) { this.memberIds = memberIds; }
    public Set<String> getAssignedInstruments() { return assignedInstruments; }
    public void setAssignedInstruments(Set<String> assignedInstruments) { this.assignedInstruments = assignedInstruments; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
