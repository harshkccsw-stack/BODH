package com.bodhpsychometric.bodhassess.domain.service;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.people.Organization;
import com.bodhpsychometric.bodhassess.domain.people.OrganizationMember;
import com.bodhpsychometric.bodhassess.domain.people.OrganizationStatus;
import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.repository.OrganizationMemberRepository;
import com.bodhpsychometric.bodhassess.domain.repository.OrganizationRepository;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;

/**
 * Organizations + temporal membership. Membership rows are history: leaving
 * stamps removedAt, re-joining inserts a fresh row, user data is never
 * touched. At most one active row per (org, user) — enforced here.
 */
@Service
@Transactional
public class OrganizationService {

    private final OrganizationRepository organizationRepository;
    private final OrganizationMemberRepository memberRepository;
    private final UserRepository userRepository;

    public OrganizationService(OrganizationRepository organizationRepository,
                               OrganizationMemberRepository memberRepository,
                               UserRepository userRepository) {
        this.organizationRepository = organizationRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
    }

    /** Admin-created orgs are born ACTIVE; public self-signups are born PENDING. */
    public Organization create(Organization organization, boolean selfSignup) {
        organization.setStatus(selfSignup ? OrganizationStatus.PENDING : OrganizationStatus.ACTIVE);
        return organizationRepository.save(organization);
    }

    public Organization approve(Long organizationId) {
        Organization organization = live(organizationId);
        if (organization.getStatus() != OrganizationStatus.PENDING) {
            throw new ConflictException("Organization " + organizationId + " is not pending approval");
        }
        organization.setStatus(OrganizationStatus.ACTIVE);
        return organization;
    }

    public Organization setStatus(Long organizationId, OrganizationStatus status) {
        Organization organization = live(organizationId);
        organization.setStatus(status);
        return organization;
    }

    public OrganizationMember addMember(Long organizationId, Long userId) {
        Organization organization = live(organizationId);
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));
        if (memberRepository.existsByOrganizationIdAndUserIdAndRemovedAtIsNull(organizationId, userId)) {
            throw new ConflictException("User " + userId + " is already an active member of organization "
                    + organizationId);
        }
        OrganizationMember member = new OrganizationMember();
        member.setOrganization(organization);
        member.setUser(user);
        return memberRepository.save(member);
    }

    /** Removes the mapping only — the row survives as history, the user is untouched. */
    public void removeMember(Long organizationId, Long userId) {
        OrganizationMember member = memberRepository
                .findByOrganizationIdAndUserIdAndRemovedAtIsNull(organizationId, userId)
                .orElseThrow(() -> new NotFoundException("OrganizationMember",
                        organizationId + "/" + userId));
        member.setRemovedAt(OffsetDateTime.now());
    }

    public void bin(Long organizationId) {
        live(organizationId).moveToBin(OffsetDateTime.now());
    }

    public void restore(Long organizationId) {
        organizationRepository.findById(organizationId)
                .orElseThrow(() -> new NotFoundException("Organization", organizationId))
                .restoreFromBin();
    }

    @Transactional(readOnly = true)
    public Organization get(Long organizationId) {
        return live(organizationId);
    }

    @Transactional(readOnly = true)
    public List<OrganizationMember> activeMembers(Long organizationId) {
        return memberRepository.findByOrganizationIdAndRemovedAtIsNull(organizationId);
    }

    @Transactional(readOnly = true)
    public List<OrganizationMember> membershipHistory(Long organizationId) {
        return memberRepository.findByOrganizationIdOrderByCreatedAtDesc(organizationId);
    }

    private Organization live(Long id) {
        return organizationRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("Organization", id));
    }
}
