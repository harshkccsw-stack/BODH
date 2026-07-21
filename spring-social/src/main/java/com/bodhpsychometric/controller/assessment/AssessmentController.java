package com.bodhpsychometric.controller.assessment;

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

import com.bodhpsychometric.dto.AssessmentRequest;
import com.bodhpsychometric.dto.AssessmentResponse;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireRepository;

import jakarta.validation.Valid;

/**
 * Catalog CRUD for assessments — each row offers one questionnaire under a
 * chosen configuration; the same questionnaire may back many assessments.
 * Transactional at class level: the response DTO walks the lazy
 * questionnaire reference.
 */
@RestController
@RequestMapping("/api/assessments")
@Transactional
public class AssessmentController {

    @Autowired
    private AssessmentRepository assessmentRepository;

    @Autowired
    private QuestionnaireRepository questionnaireRepository;

    @Autowired
    private RespondentAssessmentMappingRepository respondentAssessmentMappingRepository;

    private int respondentCountOf(Long assessmentId) {
        return (int) respondentAssessmentMappingRepository.countByAssessmentAssessmentId(assessmentId);
    }

    @GetMapping("/getAll")
    public List<AssessmentResponse> getAllAssessments() {
        return assessmentRepository.findAll().stream()
                .map(a -> AssessmentResponse.from(a, respondentCountOf(a.getAssessmentId())))
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<AssessmentResponse> getAssessmentById(@PathVariable Long id) {
        return assessmentRepository.findById(id)
                .map(a -> ResponseEntity.ok(AssessmentResponse.from(a, respondentCountOf(id))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createAssessment(@Valid @RequestBody AssessmentRequest request) {
        Questionnaire questionnaire = questionnaireRepository.findById(request.questionnaireId()).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "unknown questionnaireId " + request.questionnaireId()));
        }
        Assessment assessment = new Assessment();
        apply(assessment, request, questionnaire);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(AssessmentResponse.from(assessmentRepository.save(assessment), 0));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateAssessment(@PathVariable Long id,
            @Valid @RequestBody AssessmentRequest request) {
        Assessment assessment = assessmentRepository.findById(id).orElse(null);
        if (assessment == null) {
            return ResponseEntity.notFound().build();
        }
        Questionnaire questionnaire = questionnaireRepository.findById(request.questionnaireId()).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "unknown questionnaireId " + request.questionnaireId()));
        }
        apply(assessment, request, questionnaire);
        return ResponseEntity.ok(
                AssessmentResponse.from(assessmentRepository.save(assessment), respondentCountOf(id)));
    }

    /**
     * Deletes an assessment. Attempts (and their answers) are respondent
     * data — an assessment that has been taken is not deletable; deactivate
     * it instead.
     */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteAssessment(@PathVariable Long id) {
        Assessment assessment = assessmentRepository.findById(id).orElse(null);
        if (assessment == null) {
            return ResponseEntity.notFound().build();
        }
        int attempts = respondentCountOf(id);
        if (attempts > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "assessment has " + attempts + " respondent attempt(s) — set it INACTIVE instead of deleting"));
        }
        assessmentRepository.delete(assessment);
        return ResponseEntity.noContent().build();
    }

    private void apply(Assessment assessment, AssessmentRequest request, Questionnaire questionnaire) {
        assessment.setQuestionnaire(questionnaire);
        assessment.setName(request.name().trim());
        assessment.setShowTermsAndConditions(
                request.showTermsAndConditions() == null || request.showTermsAndConditions());
        assessment.setStatus(request.status() == null ? AssessmentStatus.INACTIVE : request.status());
        assessment.setAutoNext(Boolean.TRUE.equals(request.autoNext()));
    }
}
