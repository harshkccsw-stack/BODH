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
import com.bodhpsychometric.model.assessment.AssessmentTerms;
import com.bodhpsychometric.model.assessment.AssessmentThankYou;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.OrganizationAssessmentMappingRepository;
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

    @Autowired
    private OrganizationAssessmentMappingRepository organizationAssessmentMappingRepository;

    private int respondentCountOf(Long assessmentId) {
        return (int) respondentAssessmentMappingRepository.countByAssessmentAssessmentId(assessmentId);
    }

    /**
     * The starting consent text for a new assessment. Served rather than
     * duplicated in the dashboard so the wording has exactly one home — the
     * portal falls back to the same constant for rows that never set one.
     */
    @GetMapping("/terms-template")
    public Map<String, String> getTermsTemplate() {
        return Map.of("termsAndConditions", AssessmentTerms.DEFAULT_HTML);
    }

    /** The starting thank-you message for a new assessment — same reasoning. */
    @GetMapping("/thank-you-template")
    public Map<String, String> getThankYouTemplate() {
        return Map.of("thankYouMessage", AssessmentThankYou.DEFAULT_HTML);
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
        String error = windowErrorOf(request);
        if (error == null) {
            error = termsErrorOf(request, null);
        }
        if (error == null) {
            error = thankYouErrorOf(request, null);
        }
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("message", error));
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
        String error = windowErrorOf(request);
        if (error == null) {
            error = termsErrorOf(request, assessment);
        }
        if (error == null) {
            error = thankYouErrorOf(request, assessment);
        }
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("message", error));
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
        // Org catalog rows are meaningless without the assessment — clean them
        // with it (attempt-free by the check above, so nothing is orphaned).
        organizationAssessmentMappingRepository.deleteByAssessment_AssessmentId(id);
        assessmentRepository.delete(assessment);
        return ResponseEntity.noContent().build();
    }

    /**
     * Why this request's consent text cannot be stored, or null. Two rules:
     * the markup must be the editor's allowed subset (see AssessmentTerms —
     * this body renders as HTML in respondents' browsers), and a request that
     * turns the terms gate ON must not leave it empty, or respondents would
     * be asked to consent to a blank page.
     *
     * <p>A null body is "leave what is stored alone", so the emptiness check
     * looks at what the assessment WOULD end up with, not just what was sent.
     */
    private String termsErrorOf(AssessmentRequest request, Assessment current) {
        String markupError = AssessmentTerms.validationErrorOf(request.termsAndConditions());
        if (markupError != null) {
            return markupError;
        }
        boolean showTerms = request.showTermsAndConditions() == null || request.showTermsAndConditions();
        if (!showTerms) {
            return null;
        }
        String resulting = request.termsAndConditions() != null
                ? request.termsAndConditions()
                : (current == null ? null : current.getTermsAndConditions());
        // A new assessment with no body at all is fine — it inherits the
        // default. Only an explicitly emptied editor is a mistake worth
        // rejecting, and that arrives as a non-null blank body.
        if (request.termsAndConditions() != null && AssessmentTerms.isBlank(resulting)) {
            return "termsAndConditions cannot be empty while terms & conditions are shown";
        }
        return null;
    }

    /**
     * Why this request's thank-you page cannot be stored, or null. The message
     * renders as HTML in respondents' browsers, so it gets the consent text's
     * markup check; blank is fine (it means the default). The contact person
     * is both or neither — a name nobody can write to, or an address with no
     * name, is not a contact. Judged on what the assessment WOULD hold, since
     * null leaves a stored value alone.
     */
    private String thankYouErrorOf(AssessmentRequest request, Assessment current) {
        String markupError = AssessmentThankYou.validationErrorOf(request.thankYouMessage());
        if (markupError != null) {
            return markupError;
        }
        String name = resulting(request.contactName(), current == null ? null : current.getContactName());
        String email = resulting(request.contactEmail(), current == null ? null : current.getContactEmail());
        if (name == null && email != null) {
            return "Contact person name is required when an email is given";
        }
        if (name != null && email == null) {
            return "Contact person email is required when a name is given";
        }
        return null;
    }

    /** A submitted text field over the stored one: null keeps, blank clears, else trimmed. */
    private static String resulting(String submitted, String stored) {
        if (submitted == null) {
            return stored;
        }
        return submitted.isBlank() ? null : submitted.trim();
    }

    /**
     * Cross-field check on the availability window — an annotation on the
     * record cannot see both fields. Either date alone is fine ("open-ended"
     * in both directions); only an inverted pair is rejected. Returns null
     * when the window is acceptable.
     */
    private String windowErrorOf(AssessmentRequest request) {
        if (request.startDate() != null && request.endDate() != null
                && request.endDate().isBefore(request.startDate())) {
            return "endDate must be on or after startDate";
        }
        return null;
    }

    private void apply(Assessment assessment, AssessmentRequest request, Questionnaire questionnaire) {
        assessment.setQuestionnaire(questionnaire);
        assessment.setName(request.name().trim());
        assessment.setShowTermsAndConditions(
                request.showTermsAndConditions() == null || request.showTermsAndConditions());
        // Null leaves the stored body alone — turning the gate off must not
        // discard text the author spent time on, and the form omits the field
        // entirely while the toggle is off.
        if (request.termsAndConditions() != null) {
            assessment.setTermsAndConditions(request.termsAndConditions());
        }
        // Thank-you page: null keeps the stored value (see AssessmentRequest);
        // a blank message is stored as NULL so the default applies.
        if (request.thankYouMessage() != null) {
            assessment.setThankYouMessage(AssessmentThankYou.stored(request.thankYouMessage()));
        }
        assessment.setContactName(resulting(request.contactName(), assessment.getContactName()));
        assessment.setContactEmail(resulting(request.contactEmail(), assessment.getContactEmail()));
        assessment.setStatus(request.status() == null ? AssessmentStatus.INACTIVE : request.status());
        assessment.setAutoNext(Boolean.TRUE.equals(request.autoNext()));
        // Default true (like showTermsAndConditions): null keeps the index on.
        assessment.setShowQuestionIndex(
                request.showQuestionIndex() == null || request.showQuestionIndex());
        // Null → ONE_PER_PAGE (the setter's default), like every toggle here.
        assessment.setQuestionLayout(request.questionLayout());
        // Default FALSE (like autoNext): an omitted field must not arm a timer
        // that can end a respondent's attempt.
        assessment.setAttentionTimer(Boolean.TRUE.equals(request.attentionTimer()));
        // Default FALSE: partial saving is opt-in per assessment.
        assessment.setSavePartialAnswers(Boolean.TRUE.equals(request.savePartialAnswers()));
        // Window: null clears it — the form always sends both fields, so an
        // emptied date input must be able to remove a previously saved one.
        assessment.setStartDate(request.startDate());
        assessment.setEndDate(request.endDate());
    }
}
