package com.bodhpsychometric.bodhassess.domain.service;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.people.Organization;
import com.bodhpsychometric.bodhassess.domain.people.RespondentGroup;
import com.bodhpsychometric.bodhassess.domain.people.RespondentGroupMember;
import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.repository.OrganizationRepository;
import com.bodhpsychometric.bodhassess.domain.repository.RespondentGroupMemberRepository;
import com.bodhpsychometric.bodhassess.domain.repository.RespondentGroupRepository;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;

/**
 * Groups belong to exactly one organization; hierarchy stays same-org and
 * acyclic (checked here, hardened by composite FK at cutover). Group
 * membership is temporal and deliberately independent of org membership.
 */
@Service
@Transactional
public class RespondentGroupService {

    private final RespondentGroupRepository groupRepository;
    private final RespondentGroupMemberRepository memberRepository;
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;

    public RespondentGroupService(RespondentGroupRepository groupRepository,
                                  RespondentGroupMemberRepository memberRepository,
                                  OrganizationRepository organizationRepository,
                                  UserRepository userRepository) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
    }

    public RespondentGroup create(Long organizationId, String name, String description, Long parentGroupId) {
        Organization organization = organizationRepository.findByIdAndDeletedAtIsNull(organizationId)
                .orElseThrow(() -> new NotFoundException("Organization", organizationId));
        RespondentGroup group = new RespondentGroup();
        group.setOrganization(organization);
        group.setName(name);
        group.setDescription(description);
        if (parentGroupId != null) {
            group.setParent(requireSameOrgParent(organizationId, parentGroupId));
        }
        return groupRepository.save(group);
    }

    public RespondentGroup update(Long groupId, String name, String description) {
        RespondentGroup group = live(groupId);
        group.setName(name);
        group.setDescription(description);
        return group;
    }

    public RespondentGroup move(Long groupId, Long newParentGroupId) {
        RespondentGroup group = live(groupId);
        if (newParentGroupId == null) {
            group.setParent(null);
            return group;
        }
        RespondentGroup newParent = requireSameOrgParent(group.getOrganization().getId(), newParentGroupId);
        for (RespondentGroup cursor = newParent; cursor != null; cursor = cursor.getParent()) {
            if (cursor.getId().equals(groupId)) {
                throw new ValidationException("Moving group " + groupId + " under " + newParentGroupId
                        + " would create a cycle");
            }
        }
        group.setParent(newParent);
        return group;
    }

    public RespondentGroupMember addMember(Long groupId, Long userId) {
        RespondentGroup group = live(groupId);
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));
        if (memberRepository.existsByGroupIdAndUserIdAndRemovedAtIsNull(groupId, userId)) {
            throw new ConflictException("User " + userId + " is already an active member of group " + groupId);
        }
        RespondentGroupMember member = new RespondentGroupMember();
        member.setGroup(group);
        member.setUser(user);
        return memberRepository.save(member);
    }

    public void removeMember(Long groupId, Long userId) {
        RespondentGroupMember member = memberRepository
                .findByGroupIdAndUserIdAndRemovedAtIsNull(groupId, userId)
                .orElseThrow(() -> new NotFoundException("RespondentGroupMember", groupId + "/" + userId));
        member.setRemovedAt(OffsetDateTime.now());
    }

    public void bin(Long groupId) {
        RespondentGroup group = live(groupId);
        if (!groupRepository.findByParentIdAndDeletedAtIsNull(groupId).isEmpty()) {
            throw new ConflictException("Group " + groupId + " has live sub-groups — bin or move them first");
        }
        group.moveToBin(OffsetDateTime.now());
    }

    public void restore(Long groupId) {
        RespondentGroup group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("RespondentGroup", groupId));
        if (group.getParent() != null && group.getParent().isDeleted()) {
            throw new ConflictException("Restore the parent group first");
        }
        group.restoreFromBin();
    }

    @Transactional(readOnly = true)
    public List<RespondentGroup> rootsOf(Long organizationId) {
        return groupRepository.findByOrganizationIdAndParentIsNullAndDeletedAtIsNullOrderByNameAsc(organizationId);
    }

    @Transactional(readOnly = true)
    public List<RespondentGroupMember> activeMembers(Long groupId) {
        return memberRepository.findByGroupIdAndRemovedAtIsNull(groupId);
    }

    private RespondentGroup requireSameOrgParent(Long organizationId, Long parentGroupId) {
        RespondentGroup parent = live(parentGroupId);
        if (!parent.getOrganization().getId().equals(organizationId)) {
            throw new ValidationException("Parent group " + parentGroupId + " belongs to a different organization");
        }
        return parent;
    }

    private RespondentGroup live(Long id) {
        return groupRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("RespondentGroup", id));
    }
}
