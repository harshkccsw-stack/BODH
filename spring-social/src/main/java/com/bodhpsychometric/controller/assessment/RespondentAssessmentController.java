package com.bodhpsychometric.controller.assessment;

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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.RespondentAssessmentAssignRequest;
import com.bodhpsychometric.dto.RespondentAssessmentResponse;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.OrganizationAssessmentMappingRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;

import jakarta.validation.Valid;

/**
 * Assigning assessments to respondents — creating allotment rows. The
 * segregation rule lives here: a respondent WITH an organization may only
 * receive assessments mapped to that organization
 * (OrganizationAssessmentMapping); a respondent WITHOUT one is assigned
 * directly (the Assessment Mapping page's flow). Exactly one allotment per
 * (respondent, assessment) pair — there are no re-attempts.
 */
@RestController
@RequestMapping("/api/respondent-assessments")
@Transactional
public class RespondentAssessmentController {

    @Autowired
    private RespondentAssessmentMappingRepository respondentAssessmentMappingRepository;

    @Autowired
    private OrganizationAssessmentMappingRepository organizationAssessmentMappingRepository;

    @Autowired
    private AssessmentRepository assessmentRepository;

    @Autowired
    private RespondentUserRepository respondentUserRepository;

    @Autowired
    private DemographicResponseRepository demographicResponseRepository;

    @GetMapping("/getAll")
    public List<RespondentAssessmentResponse> getAllAssignments() {
        return respondentAssessmentMappingRepository.findAllForListing().stream()
                .map(RespondentAssessmentResponse::from)
                .toList();
    }

    @GetMapping("/getByAssessmentId/{assessmentId}")
    public List<RespondentAssessmentResponse> getByAssessmentId(@PathVariable Long assessmentId) {
        return respondentAssessmentMappingRepository.findByAssessmentForListing(assessmentId).stream()
                .map(RespondentAssessmentResponse::from)
                .toList();
    }

    @GetMapping("/getByRespondentId/{respondentUserId}")
    public List<RespondentAssessmentResponse> getByRespondentId(@PathVariable Long respondentUserId) {
        return respondentAssessmentMappingRepository.findByRespondentForListing(respondentUserId).stream()
                .map(RespondentAssessmentResponse::from)
                .toList();
    }

    /**
     * Bulk/single assign — all-or-nothing: every respondent is validated
     * (pass 1) before any allotment row is written (pass 2).
     */
    @PostMapping("/assign")
    public ResponseEntity<?> assignAssessment(@Valid @RequestBody RespondentAssessmentAssignRequest request) {
        Assessment assessment = assessmentRepository.findById(request.assessmentId()).orElse(null);
        if (assessment == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Assessment " + request.assessmentId() + " not found"));
        }
        if (assessment.getStatus() != AssessmentStatus.ACTIVE) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "Assessment \"" + assessment.getName()
                            + "\" is INACTIVE — activate it before assigning"));
        }

        // Pass 1 — resolve and validate everything before writing anything.
        List<RespondentUser> respondents = new ArrayList<>();
        for (Long respondentUserId : request.respondentUserIds().stream().distinct().toList()) {
            RespondentUser respondent = respondentUserRepository.findById(respondentUserId).orElse(null);
            if (respondent == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Respondent " + respondentUserId + " not found"));
            }
            if (respondent.getOrganization() != null && !organizationAssessmentMappingRepository
                    .existsByOrganization_OrganizationIdAndAssessment_AssessmentId(
                            respondent.getOrganization().getOrganizationId(), assessment.getAssessmentId())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "\"" + respondent.getName() + "\"'s organization ("
                                + respondent.getOrganization().getName()
                                + ") does not have this assessment mapped"));
            }
            if (respondentAssessmentMappingRepository
                    .existsByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessment.getAssessmentId())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "\"" + respondent.getName()
                                + "\" is already assigned this assessment"));
            }
            respondents.add(respondent);
        }

        // Pass 2 — write the allotment rows.
        List<RespondentAssessmentResponse> created = new ArrayList<>();
        for (RespondentUser respondent : respondents) {
            RespondentAssessmentMapping mapping = new RespondentAssessmentMapping();
            mapping.setRespondent(respondent);
            mapping.setAssessment(assessment);
            created.add(RespondentAssessmentResponse.from(
                    respondentAssessmentMappingRepository.save(mapping)));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Un-assign: NOT_STARTED and ONGOING allotments may both go — COMPLETED
     * is the only frozen state. Answers hang off the (respondent, assessment)
     * pair and only exist once the allotment is COMPLETED, which this gate
     * keeps undeletable, so removing a live allotment never strands answers.
     * A started allotment's demographic responses are deleted with it.
     */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteAssignment(@PathVariable Long id) {
        RespondentAssessmentMapping mapping = respondentAssessmentMappingRepository.findById(id).orElse(null);
        if (mapping == null) {
            return ResponseEntity.notFound().build();
        }
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "This assessment is COMPLETED and cannot be removed"));
        }
        demographicResponseRepository.deleteByRespondent_IdAndAssessment_AssessmentId(
                mapping.getRespondent().getId(), mapping.getAssessment().getAssessmentId());
        respondentAssessmentMappingRepository.delete(mapping);
        return ResponseEntity.noContent().build();
    }
}
