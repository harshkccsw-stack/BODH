package com.bodhpsychometric.controller.organization;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.OrganizationAssignRequest;
import com.bodhpsychometric.dto.OrganizationDetailResponse;
import com.bodhpsychometric.dto.OrganizationDetailResponse.MemberRef;
import com.bodhpsychometric.dto.OrganizationDetailResponse.StaffRef;
import com.bodhpsychometric.dto.OrganizationRequest;
import com.bodhpsychometric.dto.OrganizationResponse;
import com.bodhpsychometric.dto.UnassignedPeopleResponse;
import com.bodhpsychometric.model.auth.PractitionerUser;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.repository.auth.PractitionerUserRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.organization.OrganizationRepository;

import jakarta.validation.Valid;

/**
 * Organization catalog CRUD. Staff (practitioners) and members (respondents)
 * attach through their own pages — this controller only reads membership
 * (counts on the list, full refs on the detail).
 *
 * Conflicts (duplicate name, delete-while-populated) are PRE-checked with
 * exists queries; catching the flush inside @Transactional would mark the
 * transaction rollback-only and 500 at commit. The member FKs are RESTRICT,
 * so the delete pre-check is what turns a would-be 500 into a clean 409.
 */
@RestController
@RequestMapping("/api/organizations")
@Transactional
public class OrganizationController {

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private PractitionerUserRepository practitionerUserRepository;

    @Autowired
    private RespondentUserRepository respondentUserRepository;

    @GetMapping("/getAll")
    public List<OrganizationResponse> getAllOrganizations() {
        return organizationRepository.findAll().stream()
                .map(o -> OrganizationResponse.from(o,
                        practitionerUserRepository.countByOrganization_OrganizationId(o.getOrganizationId()),
                        respondentUserRepository.countByOrganization_OrganizationId(o.getOrganizationId())))
                .toList();
    }

    /** Drill-in: the org plus its staff and member lists. */
    @GetMapping("/getById/{id}")
    public ResponseEntity<OrganizationDetailResponse> getOrganizationById(@PathVariable Long id) {
        Organization organization = organizationRepository.findById(id).orElse(null);
        if (organization == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(OrganizationDetailResponse.from(organization,
                practitionerUserRepository.findForOrganizationDetail(id),
                respondentUserRepository.findForOrganizationDetail(id)));
    }

    /** Everyone not yet in any org — what the assign picker lists. */
    @GetMapping("/getUnassigned")
    public UnassignedPeopleResponse getUnassignedPeople() {
        return new UnassignedPeopleResponse(
                practitionerUserRepository.findUnassignedForPicker().stream()
                        .map(StaffRef::from).toList(),
                respondentUserRepository.findUnassignedForPicker().stream()
                        .map(MemberRef::from).toList());
    }

    /**
     * Bulk-assign unassigned people into this org — all-or-nothing: every id
     * is resolved and checked (pass 1) before anything is written (pass 2),
     * so a bad id can never leave the batch half-assigned.
     */
    @PutMapping("/assign/{id}")
    public ResponseEntity<?> assignPeople(@PathVariable Long id,
            @RequestBody OrganizationAssignRequest request) {
        Organization organization = organizationRepository.findById(id).orElse(null);
        if (organization == null) {
            return ResponseEntity.notFound().build();
        }
        List<Long> practitionerIds = request.practitionerIds() == null
                ? List.of() : request.practitionerIds();
        List<Long> respondentIds = request.respondentIds() == null
                ? List.of() : request.respondentIds();
        if (practitionerIds.isEmpty() && respondentIds.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Nothing to assign — pick at least one person"));
        }

        // Pass 1 — resolve and validate everything before writing anything.
        List<PractitionerUser> practitioners = new ArrayList<>();
        for (Long practitionerId : practitionerIds) {
            PractitionerUser practitioner = practitionerUserRepository.findById(practitionerId).orElse(null);
            if (practitioner == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Practitioner " + practitionerId + " not found"));
            }
            if (practitioner.getOrganization() != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "Practitioner \"" + practitioner.getName()
                                + "\" already belongs to an organization"));
            }
            practitioners.add(practitioner);
        }
        List<RespondentUser> respondents = new ArrayList<>();
        for (Long respondentId : respondentIds) {
            RespondentUser respondent = respondentUserRepository.findById(respondentId).orElse(null);
            if (respondent == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Respondent " + respondentId + " not found"));
            }
            if (respondent.getOrganization() != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "Respondent \"" + respondent.getName()
                                + "\" already belongs to an organization"));
            }
            respondents.add(respondent);
        }

        // Pass 2 — write.
        practitioners.forEach(p -> p.setOrganization(organization));
        respondents.forEach(r -> r.setOrganization(organization));
        practitionerUserRepository.saveAll(practitioners);
        respondentUserRepository.saveAll(respondents);

        return ResponseEntity.ok(OrganizationDetailResponse.from(organization,
                practitionerUserRepository.findForOrganizationDetail(id),
                respondentUserRepository.findForOrganizationDetail(id)));
    }

    /**
     * Detach people from this org — the mirror of assign, same all-or-nothing
     * shape. Everyone in the batch must currently belong to THIS org.
     */
    @PutMapping("/unassign/{id}")
    public ResponseEntity<?> unassignPeople(@PathVariable Long id,
            @RequestBody OrganizationAssignRequest request) {
        Organization organization = organizationRepository.findById(id).orElse(null);
        if (organization == null) {
            return ResponseEntity.notFound().build();
        }
        List<Long> practitionerIds = request.practitionerIds() == null
                ? List.of() : request.practitionerIds();
        List<Long> respondentIds = request.respondentIds() == null
                ? List.of() : request.respondentIds();
        if (practitionerIds.isEmpty() && respondentIds.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Nothing to unassign — pick at least one person"));
        }

        // Pass 1 — resolve and validate everything before writing anything.
        List<PractitionerUser> practitioners = new ArrayList<>();
        for (Long practitionerId : practitionerIds) {
            PractitionerUser practitioner = practitionerUserRepository.findById(practitionerId).orElse(null);
            if (practitioner == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Practitioner " + practitionerId + " not found"));
            }
            if (practitioner.getOrganization() == null
                    || !practitioner.getOrganization().getOrganizationId().equals(id)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "Practitioner \"" + practitioner.getName()
                                + "\" is not in this organization"));
            }
            practitioners.add(practitioner);
        }
        List<RespondentUser> respondents = new ArrayList<>();
        for (Long respondentId : respondentIds) {
            RespondentUser respondent = respondentUserRepository.findById(respondentId).orElse(null);
            if (respondent == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Respondent " + respondentId + " not found"));
            }
            if (respondent.getOrganization() == null
                    || !respondent.getOrganization().getOrganizationId().equals(id)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "Respondent \"" + respondent.getName()
                                + "\" is not in this organization"));
            }
            respondents.add(respondent);
        }

        // Pass 2 — write.
        practitioners.forEach(p -> p.setOrganization(null));
        respondents.forEach(r -> r.setOrganization(null));
        practitionerUserRepository.saveAll(practitioners);
        respondentUserRepository.saveAll(respondents);

        return ResponseEntity.ok(OrganizationDetailResponse.from(organization,
                practitionerUserRepository.findForOrganizationDetail(id),
                respondentUserRepository.findForOrganizationDetail(id)));
    }

    @PostMapping("/create")
    public ResponseEntity<?> createOrganization(@Valid @RequestBody OrganizationRequest request) {
        String name = request.name().trim();
        if (organizationRepository.existsByNameIgnoreCase(name)) {
            return duplicateName();
        }
        Organization organization = new Organization();
        apply(organization, request, name);
        organization = organizationRepository.save(organization);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(OrganizationResponse.from(organization, 0, 0));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateOrganization(@PathVariable Long id,
            @Valid @RequestBody OrganizationRequest request) {
        Organization organization = organizationRepository.findById(id).orElse(null);
        if (organization == null) {
            return ResponseEntity.notFound().build();
        }
        String name = request.name().trim();
        if (organizationRepository.existsByNameIgnoreCaseAndOrganizationIdNot(name, id)) {
            return duplicateName();
        }
        apply(organization, request, name);
        organization = organizationRepository.save(organization);
        return ResponseEntity.ok(OrganizationResponse.from(organization,
                practitionerUserRepository.countByOrganization_OrganizationId(id),
                respondentUserRepository.countByOrganization_OrganizationId(id)));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteOrganization(@PathVariable Long id) {
        if (!organizationRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        if (practitionerUserRepository.existsByOrganization_OrganizationId(id)
                || respondentUserRepository.existsByOrganization_OrganizationId(id)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "This organization still has staff or members — move them out first"));
        }
        organizationRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void apply(Organization organization, OrganizationRequest request, String name) {
        organization.setName(name);
        organization.setOrgEmail(request.orgEmail() == null || request.orgEmail().isBlank()
                ? null : request.orgEmail().trim());
        organization.setDescription(request.description() == null || request.description().isBlank()
                ? null : request.description().trim());
    }

    private ResponseEntity<Map<String, String>> duplicateName() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "An organization with this name already exists"));
    }
}
