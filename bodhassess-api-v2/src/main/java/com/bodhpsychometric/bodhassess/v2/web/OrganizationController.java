package com.bodhpsychometric.bodhassess.v2.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.domain.auth.enums.OrganizationStatus;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.Organization;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.OrganizationMember;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.RespondentGroup;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.RespondentGroupMember;
import com.bodhpsychometric.bodhassess.domain.repository.OrganizationRepository;
import com.bodhpsychometric.bodhassess.domain.service.OrganizationService;
import com.bodhpsychometric.bodhassess.domain.service.RespondentGroupService;

@RestController
@RequestMapping("/api/v2/organizations")
public class OrganizationController {

    public record OrganizationRequest(String name, String website, String contactName,
                                      String contactEmail, String contactPhone, Boolean selfSignup) {}
    public record StatusRequest(OrganizationStatus status) {}
    public record GroupRequest(String name, String description, Long parentGroupId) {}
    public record MoveGroupRequest(Long parentGroupId) {}

    public record OrganizationDto(Long id, String name, String website, String contactName,
                                  String contactEmail, String contactPhone, OrganizationStatus status) {
        static OrganizationDto from(Organization o) {
            return new OrganizationDto(o.getId(), o.getName(), o.getWebsite(), o.getContactName(),
                    o.getContactEmail(), o.getContactPhone(), o.getStatus());
        }
    }

    public record MemberDto(Long id, Long userId, String joinedAt, String removedAt) {
        static MemberDto from(OrganizationMember m) {
            return new MemberDto(m.getId(), m.getUser().getId(),
                    m.getCreatedAt() == null ? null : m.getCreatedAt().toString(),
                    m.getRemovedAt() == null ? null : m.getRemovedAt().toString());
        }

        static MemberDto from(RespondentGroupMember m) {
            return new MemberDto(m.getId(), m.getUser().getId(),
                    m.getCreatedAt() == null ? null : m.getCreatedAt().toString(),
                    m.getRemovedAt() == null ? null : m.getRemovedAt().toString());
        }
    }

    public record GroupDto(Long id, Long organizationId, String name, String description, Long parentGroupId) {
        static GroupDto from(RespondentGroup g) {
            return new GroupDto(g.getId(), g.getOrganization().getId(), g.getName(), g.getDescription(),
                    g.getParent() == null ? null : g.getParent().getId());
        }
    }

    private final OrganizationService organizations;
    private final RespondentGroupService groups;
    private final OrganizationRepository organizationRepository;

    public OrganizationController(OrganizationService organizations,
                                  RespondentGroupService groups,
                                  OrganizationRepository organizationRepository) {
        this.organizations = organizations;
        this.groups = groups;
        this.organizationRepository = organizationRepository;
    }

    // ── Organizations ────────────────────────────────────────────────────

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrganizationDto create(@RequestBody OrganizationRequest body) {
        Organization organization = new Organization();
        organization.setName(body.name());
        organization.setWebsite(body.website());
        organization.setContactName(body.contactName());
        organization.setContactEmail(body.contactEmail());
        organization.setContactPhone(body.contactPhone());
        return OrganizationDto.from(organizations.create(organization, Boolean.TRUE.equals(body.selfSignup())));
    }

    @GetMapping
    public List<OrganizationDto> list() {
        return organizationRepository.findByDeletedAtIsNullOrderByNameAsc()
                .stream().map(OrganizationDto::from).toList();
    }

    @GetMapping("/pending")
    public List<OrganizationDto> pending() {
        return organizationRepository
                .findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(OrganizationStatus.PENDING)
                .stream().map(OrganizationDto::from).toList();
    }

    @GetMapping("/{id}")
    public OrganizationDto get(@PathVariable Long id) {
        return OrganizationDto.from(organizations.get(id));
    }

    @PostMapping("/{id}/approve")
    public OrganizationDto approve(@PathVariable Long id) {
        return OrganizationDto.from(organizations.approve(id));
    }

    @PutMapping("/{id}/status")
    public OrganizationDto setStatus(@PathVariable Long id, @RequestBody StatusRequest body) {
        return OrganizationDto.from(organizations.setStatus(id, body.status()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bin(@PathVariable Long id) {
        organizations.bin(id);
    }

    @PostMapping("/{id}/restore")
    public void restore(@PathVariable Long id) {
        organizations.restore(id);
    }

    // ── Org membership (temporal) ────────────────────────────────────────

    @PostMapping("/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.CREATED)
    public MemberDto addMember(@PathVariable Long id, @PathVariable Long userId) {
        return MemberDto.from(organizations.addMember(id, userId));
    }

    @DeleteMapping("/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@PathVariable Long id, @PathVariable Long userId) {
        organizations.removeMember(id, userId);
    }

    @GetMapping("/{id}/members")
    public List<MemberDto> members(@PathVariable Long id) {
        return organizations.activeMembers(id).stream().map(MemberDto::from).toList();
    }

    @GetMapping("/{id}/members/history")
    public List<MemberDto> membershipHistory(@PathVariable Long id) {
        return organizations.membershipHistory(id).stream().map(MemberDto::from).toList();
    }

    // ── Groups ───────────────────────────────────────────────────────────

    @PostMapping("/{id}/groups")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupDto createGroup(@PathVariable Long id, @RequestBody GroupRequest body) {
        return GroupDto.from(groups.create(id, body.name(), body.description(), body.parentGroupId()));
    }

    @GetMapping("/{id}/groups")
    public List<GroupDto> groupRoots(@PathVariable Long id) {
        return groups.rootsOf(id).stream().map(GroupDto::from).toList();
    }

    @PutMapping("/groups/{groupId}")
    public GroupDto updateGroup(@PathVariable Long groupId, @RequestBody GroupRequest body) {
        return GroupDto.from(groups.update(groupId, body.name(), body.description()));
    }

    @PutMapping("/groups/{groupId}/move")
    public GroupDto moveGroup(@PathVariable Long groupId, @RequestBody MoveGroupRequest body) {
        return GroupDto.from(groups.move(groupId, body.parentGroupId()));
    }

    @DeleteMapping("/groups/{groupId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void binGroup(@PathVariable Long groupId) {
        groups.bin(groupId);
    }

    @PostMapping("/groups/{groupId}/restore")
    public void restoreGroup(@PathVariable Long groupId) {
        groups.restore(groupId);
    }

    @PostMapping("/groups/{groupId}/members/{userId}")
    @ResponseStatus(HttpStatus.CREATED)
    public MemberDto addGroupMember(@PathVariable Long groupId, @PathVariable Long userId) {
        return MemberDto.from(groups.addMember(groupId, userId));
    }

    @DeleteMapping("/groups/{groupId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeGroupMember(@PathVariable Long groupId, @PathVariable Long userId) {
        groups.removeMember(groupId, userId);
    }

    @GetMapping("/groups/{groupId}/members")
    public List<MemberDto> groupMembers(@PathVariable Long groupId) {
        return groups.activeMembers(groupId).stream().map(MemberDto::from).toList();
    }
}
