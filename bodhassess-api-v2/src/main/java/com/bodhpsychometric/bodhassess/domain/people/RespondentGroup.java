package com.bodhpsychometric.bodhassess.domain.people;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.base.SoftDeletableEntity;

/**
 * A cohort of respondents belonging to exactly ONE organization. Hierarchy
 * via parent; the parent must belong to the same organization (Flyway
 * composite FK at cutover) and stay acyclic (service check). Membership in a
 * group does NOT imply membership in the organization — the two edges are
 * independent records. The legacy per-group instrument assignment is gone:
 * allotments are the only assignment path.
 */
@Entity
@Table(name = "RespondentGroup",
        indexes = {
                @Index(name = "idxGroupOrganization", columnList = "organizationId"),
                @Index(name = "idxGroupParent", columnList = "parentGroupId")
        })
public class RespondentGroup extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organizationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkGroupOrganization"))
    private Organization organization;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parentGroupId",
            foreignKey = @ForeignKey(name = "fkGroupParent"))
    private RespondentGroup parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<RespondentGroup> children = new ArrayList<>();

    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<RespondentGroupMember> members = new HashSet<>();

    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public RespondentGroup getParent() { return parent; }
    public void setParent(RespondentGroup parent) { this.parent = parent; }
    public List<RespondentGroup> getChildren() { return children; }
    public void setChildren(List<RespondentGroup> children) { this.children = children; }
    public Set<RespondentGroupMember> getMembers() { return members; }
    public void setMembers(Set<RespondentGroupMember> members) { this.members = members; }

    public void addChild(RespondentGroup child) {
        children.add(child);
        child.setParent(this);
        child.setOrganization(this.organization);
    }

    public void removeChild(RespondentGroup child) {
        children.remove(child);
        child.setParent(null);
    }

    public void addMember(RespondentGroupMember member) {
        members.add(member);
        member.setGroup(this);
    }
}
