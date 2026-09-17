package com.bodhpsychometric.controller.sync;

import java.util.Comparator;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.MemoryMeshAssessmentDetail;
import com.bodhpsychometric.dto.MemoryMeshAssessmentSummary;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.security.SyncKeyGuard;
import com.bodhpsychometric.service.PortalContentService;

/**
 * What MemoryMesh reads to import an assessment from here: the list, and one
 * assessment with its questionnaire flattened by {@link PortalContentService}
 * — the same shape the portal takes, so nothing is re-derived for the mirror.
 * Read-only, key-locked.
 */
@RestController
@RequestMapping("/api/sync/memorymesh/assessments")
@Transactional(readOnly = true)
public class MemoryMeshAssessmentController {

    private final AssessmentRepository assessments;
    private final PortalContentService content;
    private final SyncKeyGuard guard;

    public MemoryMeshAssessmentController(AssessmentRepository assessments, PortalContentService content,
            SyncKeyGuard guard) {
        this.assessments = assessments;
        this.content = content;
        this.guard = guard;
    }

    @GetMapping
    public ResponseEntity<?> list(
            @RequestHeader(value = SyncKeyGuard.KEY_HEADER, required = false) String key) {
        ResponseEntity<?> rejected = guard.reject(key);
        if (rejected != null) {
            return rejected;
        }
        List<MemoryMeshAssessmentSummary> out = assessments.findAll().stream()
                .sorted(Comparator.comparing(Assessment::getName, String.CASE_INSENSITIVE_ORDER))
                .map(a -> MemoryMeshAssessmentSummary.from(a,
                        content.contentOf(a.getQuestionnaire().getQuestionnaireId()).questions().size()))
                .toList();
        return ResponseEntity.ok(out);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(
            @RequestHeader(value = SyncKeyGuard.KEY_HEADER, required = false) String key,
            @PathVariable Long id) {
        ResponseEntity<?> rejected = guard.reject(key);
        if (rejected != null) {
            return rejected;
        }
        Assessment a = assessments.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Assessment not found"));
        return ResponseEntity.ok(MemoryMeshAssessmentDetail.from(a,
                content.contentOf(a.getQuestionnaire().getQuestionnaireId())));
    }
}
