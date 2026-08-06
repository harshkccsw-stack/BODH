package com.bodhpsychometric.controller.organization;

import java.time.OffsetDateTime;
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

import com.bodhpsychometric.dto.OrganizationAssessmentAssignRequest;
import com.bodhpsychometric.dto.OrganizationAssessmentResponse;
import com.bodhpsychometric.dto.OrganizationAssignRequest;
import com.bodhpsychometric.dto.OrganizationDetailResponse;
import com.bodhpsychometric.dto.OrganizationDetailResponse.MemberRef;
import com.bodhpsychometric.dto.OrganizationDetailResponse.StaffRef;
import com.bodhpsychometric.dto.OrganizationRequest;
import com.bodhpsychometric.dto.OrganizationResponse;
import com.bodhpsychometric.dto.UnassignedPeopleResponse;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.OrganizationAssessmentMapping;
import com.bodhpsychometric.model.auth.PractitionerUser;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.OrganizationAssessmentMappingRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
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

    @Autowired
    private AssessmentRepository assessmentRepository;

    @Autowired
    private OrganizationAssessmentMappingRepository organizationAssessmentMappingRepository;

    @Autowired
    private RespondentAssessmentMappingRepository respondentAssessmentMappingRepository;

    private OrganizationResponse toResponse(Organization organization) {
        Long id = organization.getOrganizationId();
        return OrganizationResponse.from(organization,
                practitionerUserRepository.countByOrganization_OrganizationId(id),
                respondentUserRepository.countByOrganization_OrganizationId(id),
                organizationAssessmentMappingRepository.countByOrganization_OrganizationId(id));
    }

    @GetMapping("/getAll")
    public List<OrganizationResponse> getAllOrganizations() {
        return organizationRepository.findAll().stream()
                .map(this::toResponse)
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
        // Initial catalog: validate every assessment id before creating anything.
        List<Long> assessmentIds = request.assessmentIds() == null
                ? List.of() : request.assessmentIds().stream().distinct().toList();
        List<Assessment> assessments = new ArrayList<>();
        for (Long assessmentId : assessmentIds) {
            Assessment assessment = assessmentRepository.findById(assessmentId).orElse(null);
            if (assessment == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Assessment " + assessmentId + " not found"));
            }
            assessments.add(assessment);
        }

        Organization organization = new Organization();
        apply(organization, request, name);
        organization = organizationRepository.save(organization);
        for (Assessment assessment : assessments) {
            organizationAssessmentMappingRepository.save(newMapping(organization, assessment));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(organization));
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
        return ResponseEntity.ok(toResponse(organization));
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
        // Catalog rows are meaningless without the org — clean them with it.
        organizationAssessmentMappingRepository.deleteByOrganization_OrganizationId(id);
        organizationRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // ── Assessment catalog (data segregation) ──────────────────────────────

    /** The org's mapped assessments, with how many of its members hold each. */
    @GetMapping("/getAssessments/{id}")
    public ResponseEntity<?> getOrganizationAssessments(@PathVariable Long id) {
        if (!organizationRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(organizationAssessmentMappingRepository.findForOrganizationCatalog(id).stream()
                .map(m -> OrganizationAssessmentResponse.from(m,
                        respondentAssessmentMappingRepository
                                .countByAssessment_AssessmentIdAndRespondent_Organization_OrganizationId(
                                        m.getAssessment().getAssessmentId(), id)))
                .toList());
    }

    /** Map assessments into the org's catalog — all-or-nothing. */
    @PutMapping("/assign-assessments/{id}")
    public ResponseEntity<?> assignAssessments(@PathVariable Long id,
            @RequestBody OrganizationAssessmentAssignRequest request) {
        Organization organization = organizationRepository.findById(id).orElse(null);
        if (organization == null) {
            return ResponseEntity.notFound().build();
        }
        List<Long> assessmentIds = request.assessmentIds() == null
                ? List.of() : request.assessmentIds().stream().distinct().toList();
        if (assessmentIds.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Nothing to map — pick at least one assessment"));
        }

        // Pass 1 — resolve and validate everything before writing anything.
        List<Assessment> assessments = new ArrayList<>();
        for (Long assessmentId : assessmentIds) {
            Assessment assessment = assessmentRepository.findById(assessmentId).orElse(null);
            if (assessment == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Assessment " + assessmentId + " not found"));
            }
            if (organizationAssessmentMappingRepository
                    .existsByOrganization_OrganizationIdAndAssessment_AssessmentId(id, assessmentId)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "Assessment \"" + assessment.getName()
                                + "\" is already mapped to this organization"));
            }
            assessments.add(assessment);
        }

        // Pass 2 — write.
        for (Assessment assessment : assessments) {
            organizationAssessmentMappingRepository.save(newMapping(organization, assessment));
        }
        return getOrganizationAssessments(id);
    }

    /**
     * Remove assessments from the org's catalog. Blocked (409) while any of
     * this org's members hold attempt rows for that assessment — revoking
     * access mid-flight would orphan their assignments.
     */
    @PutMapping("/unassign-assessments/{id}")
    public ResponseEntity<?> unassignAssessments(@PathVariable Long id,
            @RequestBody OrganizationAssessmentAssignRequest request) {
        Organization organization = organizationRepository.findById(id).orElse(null);
        if (organization == null) {
            return ResponseEntity.notFound().build();
        }
        List<Long> assessmentIds = request.assessmentIds() == null
                ? List.of() : request.assessmentIds().stream().distinct().toList();
        if (assessmentIds.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Nothing to unmap — pick at least one assessment"));
        }

        // Pass 1 — resolve and validate everything before writing anything.
        List<OrganizationAssessmentMapping> mappings = new ArrayList<>();
        for (Long assessmentId : assessmentIds) {
            Assessment assessment = assessmentRepository.findById(assessmentId).orElse(null);
            if (assessment == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Assessment " + assessmentId + " not found"));
            }
            OrganizationAssessmentMapping mapping = organizationAssessmentMappingRepository
                    .findForOrganizationCatalog(id).stream()
                    .filter(m -> m.getAssessment().getAssessmentId().equals(assessmentId))
                    .findFirst().orElse(null);
            if (mapping == null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "Assessment \"" + assessment.getName()
                                + "\" is not mapped to this organization"));
            }
            long memberAttempts = respondentAssessmentMappingRepository
                    .countByAssessment_AssessmentIdAndRespondent_Organization_OrganizationId(assessmentId, id);
            if (memberAttempts > 0) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "Assessment \"" + assessment.getName() + "\" has "
                                + memberAttempts + " member assignment(s) in this organization — remove those first"));
            }
            mappings.add(mapping);
        }

        // Pass 2 — write.
        organizationAssessmentMappingRepository.deleteAll(mappings);
        return getOrganizationAssessments(id);
    }

    private OrganizationAssessmentMapping newMapping(Organization organization, Assessment assessment) {
        OrganizationAssessmentMapping mapping = new OrganizationAssessmentMapping();
        mapping.setOrganization(organization);
        mapping.setAssessment(assessment);
        mapping.setMappedAt(OffsetDateTime.now());
        return mapping;
    }

    private void apply(Organization organization, OrganizationRequest request, String name) {
        organization.setName(name);
        organization.setOrgEmail(request.orgEmail() == null || request.orgEmail().isBlank()
                ? null : request.orgEmail().trim());
        organization.setDescription(request.description() == null || request.description().isBlank()
                ? null : request.description().trim());
        // Blank → null clears the logo; a data URL replaces it. Not trimmed —
        // base64 has no meaningful surrounding whitespace to strip.
        organization.setLogoBase64(request.logoBase64() == null || request.logoBase64().isBlank()
                ? null : request.logoBase64());
    }

    private ResponseEntity<Map<String, String>> duplicateName() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "An organization with this name already exists"));
    }
}
