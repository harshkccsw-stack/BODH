package com.bodhpsychometric.controller.catalog;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.PublicProductDetail;
import com.bodhpsychometric.dto.PublicProductSummary;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;

/**
 * Read-only catalog for the public marketing site (main-web). Serves only
 * ACTIVE assessments and only through the PublicProduct* DTOs, which omit
 * respondent counts and portal configuration.
 *
 * Note that ACTIVE currently means "can be allotted and taken" — the same flag
 * now also means "listed publicly". If those two need to diverge, add a
 * listedPublicly column and AND it into the two repository queries; nothing
 * else here changes.
 *
 * Transactional at class level, matching the other controllers: the DTOs walk
 * the lazy questionnaire reference.
 */
@RestController
@RequestMapping("/api/public/products")
@Transactional(readOnly = true)
public class PublicProductController {

    @Autowired
    private AssessmentRepository assessmentRepository;

    @Autowired
    private QuestionnaireQuestionRepository questionnaireQuestionRepository;

    @Autowired
    private MeasuredQualityRepository measuredQualityRepository;

    private int questionCountOf(Long questionnaireId) {
        return (int) questionnaireQuestionRepository.countByQuestionnaireQuestionnaireId(questionnaireId);
    }

    @GetMapping("/getAll")
    public List<PublicProductSummary> getAllProducts() {
        return assessmentRepository.findByStatusWithQuestionnaire(AssessmentStatus.ACTIVE).stream()
                .map(a -> PublicProductSummary.from(a,
                        questionCountOf(a.getQuestionnaire().getQuestionnaireId())))
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<PublicProductDetail> getProductById(@PathVariable Long id) {
        Assessment assessment = assessmentRepository
                .findByIdAndStatusWithQuestionnaire(id, AssessmentStatus.ACTIVE)
                .orElse(null);
        if (assessment == null) {
            return ResponseEntity.notFound().build();
        }
        Long questionnaireId = assessment.getQuestionnaire().getQuestionnaireId();
        return ResponseEntity.ok(PublicProductDetail.from(
                assessment,
                questionCountOf(questionnaireId),
                measuredQualityRepository.findNamesByQuestionnaireId(questionnaireId)));
    }
}
