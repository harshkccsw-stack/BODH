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
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.OrganizationAssessmentMappingRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;

import jakarta.validation.Valid;

/**
 * Assigning assessments to respondents — creating attempt #1 rows. The
 * segregation rule lives here: a respondent WITH an organization may only
 * receive assessments mapped to that organization
 * (OrganizationAssessmentMapping); a respondent WITHOUT one is assigned
 * directly (the Assessment Mapping page's flow). Re-attempts are a separate
 * later flow.
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
    private AssessmentAnswerRepository assessmentAnswerRepository;

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
     * (pass 1) before any attempt row is written (pass 2).
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
                                + "\" is already assigned this assessment — grant a re-attempt instead"));
            }
            respondents.add(respondent);
        }

        // Pass 2 — write attempt #1 rows.
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
     * Explicit admin grant of the next attempt — the longitudinal-data flow.
     * Never automatic: each call adds exactly one attempt per respondent, and
     * only pairs whose LATEST attempt is COMPLETED qualify — an open attempt
     * must be finished (or unmapped) first. Same segregation and all-or-
     * nothing rules as assign; the portal needs nothing new, the fresh
     * NOT_STARTED row simply appears in the respondent's allotted list.
     */
    @PostMapping("/reattempt")
    public ResponseEntity<?> grantReattempt(@Valid @RequestBody RespondentAssessmentAssignRequest request) {
        Assessment assessment = assessmentRepository.findById(request.assessmentId()).orElse(null);
        if (assessment == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Assessment " + request.assessmentId() + " not found"));
        }
        if (assessment.getStatus() != AssessmentStatus.ACTIVE) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "Assessment \"" + assessment.getName()
                            + "\" is INACTIVE — activate it before granting re-attempts"));
        }

        // Pass 1 — resolve and validate everything before writing anything.
        List<RespondentAssessmentMapping> latestAttempts = new ArrayList<>();
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
            RespondentAssessmentMapping latest = respondentAssessmentMappingRepository
                    .findTopByRespondent_IdAndAssessment_AssessmentIdOrderByAttemptNumberDesc(
                            respondentUserId, assessment.getAssessmentId())
                    .orElse(null);
            if (latest == null) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "\"" + respondent.getName()
                                + "\" has never been assigned this assessment — assign it instead"));
            }
            if (latest.getAssessmentStatus() != RespondentAssessmentStatus.COMPLETED) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "\"" + respondent.getName() + "\"'s attempt "
                                + latest.getAttemptNumber() + " is " + latest.getAssessmentStatus()
                                + " — a re-attempt needs the previous one COMPLETED"));
            }
            latestAttempts.add(latest);
        }

        // Pass 2 — write the next attempt rows.
        List<RespondentAssessmentResponse> created = new ArrayList<>();
        for (RespondentAssessmentMapping latest : latestAttempts) {
            RespondentAssessmentMapping next = new RespondentAssessmentMapping();
            next.setRespondent(latest.getRespondent());
            next.setAssessment(assessment);
            next.setAttemptNumber(latest.getAttemptNumber() + 1);
            created.add(RespondentAssessmentResponse.from(
                    respondentAssessmentMappingRepository.save(next)));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Un-assign: NOT_STARTED and ONGOING attempts may both go — COMPLETED is
     * the only frozen state, because answers only ever exist for COMPLETED
     * attempts (the portal writes them in one submit). An ONGOING attempt's
     * demographic responses are deleted with it.
     */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteAssignment(@PathVariable Long id) {
        RespondentAssessmentMapping mapping = respondentAssessmentMappingRepository.findById(id).orElse(null);
        if (mapping == null) {
            return ResponseEntity.notFound().build();
        }
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "This attempt is COMPLETED and cannot be removed"));
        }
        if (assessmentAnswerRepository.existsByMapping_RespondentAssessmentMappingId(id)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "This attempt already has recorded answers and cannot be removed"));
        }
        demographicResponseRepository.deleteByMapping_RespondentAssessmentMappingId(id);
        respondentAssessmentMappingRepository.delete(mapping);
        return ResponseEntity.noContent().build();
    }
}
