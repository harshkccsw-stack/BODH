package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

public class GroupDto {
    private String id;
    private String name;
    private String description;
    private String parentId;
    private List<String> memberIds = new ArrayList<>();
    private List<String> assignedInstruments = new ArrayList<>();
    private String createdAt;

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
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
