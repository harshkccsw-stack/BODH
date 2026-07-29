package com.bodhpsychometric.bodhassess.controller;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AuditLogEntryDto;
import com.bodhpsychometric.bodhassess.payload.CommitVersionRequest;
import com.bodhpsychometric.bodhassess.payload.CreateDraftRequest;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireDto;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireParentDto;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireVersionSummaryDto;
import com.bodhpsychometric.bodhassess.service.AuditService;
import com.bodhpsychometric.bodhassess.service.QuestionnaireVersioningService;

/**
 * Git-style questionnaire surface. Sits at /api/v1/questionnaire-records
 * to leave the legacy /api/v1/questionnaires endpoint serving the
 * version content (it's just one row per version row in the DB).
 *
 * Frontend tour:
 *   - Question Bank list → GET /questionnaire-records
 *   - Parent detail      → GET /questionnaire-records/{id}
 *   - Versions tab       → GET /questionnaire-records/{id}/versions?committedOnly=true
 *   - Drafts tab         → GET /questionnaire-records/{id}/versions?committedOnly=false
 *                          (filter to status=DRAFT client-side)
 *   - Edit a draft       → PATCH /questionnaire-records/{id}/versions/{vid}
 *   - Commit modal       → POST  /questionnaire-records/{id}/versions/{vid}/commit
 *   - Set as current     → PATCH /questionnaire-records/{id}/current-version { versionId }
 *   - Audit tab          → GET   /questionnaire-records/{id}/audit
 */
@RestController
@RequestMapping("/api/v1/questionnaire-records")
public class QuestionnaireVersioningController {

    @Autowired private QuestionnaireVersioningService service;
    @Autowired private AuditService auditService;

    // ---------------- Parents ----------------

    @GetMapping
    public List<QuestionnaireParentDto> listParents() {
        return service.listParents();
    }

    @GetMapping("/{id}")
    public QuestionnaireParentDto getParent(@PathVariable String id) {
        return service.getParent(id);
    }

    @PostMapping
    public ResponseEntity<QuestionnaireParentDto> createParent(@RequestBody QuestionnaireParentDto body) {
        return new ResponseEntity<>(service.createParent(body), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public QuestionnaireParentDto updateParent(@PathVariable String id, @RequestBody QuestionnaireParentDto body) {
        return service.updateParent(id, body);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteParent(@PathVariable String id) {
        service.deleteParent(id);
        return ResponseEntity.noContent().build();
    }

    /** Body: { "versionId": "V-XXXXXXXX" }. Target must be COMMITTED. */
    @PatchMapping("/{id}/current-version")
    public QuestionnaireParentDto setCurrentVersion(@PathVariable String id, @RequestBody Map<String, String> body) {
        return service.setCurrentVersion(id, body == null ? null : body.get("versionId"));
    }

    @GetMapping("/{id}/audit")
    public List<AuditLogEntryDto> audit(@PathVariable String id) {
        return auditService.listForTarget("questionnaire", id);
    }

    // ---------------- Versions ----------------

    @GetMapping("/{id}/versions")
    public List<QuestionnaireVersionSummaryDto> listVersions(
            @PathVariable String id,
            @RequestParam(value = "committedOnly", required = false, defaultValue = "false") boolean committedOnly) {
        return service.listVersions(id, committedOnly);
    }

    @PostMapping("/{id}/versions/drafts")
    public ResponseEntity<QuestionnaireVersionSummaryDto> createDraft(
            @PathVariable String id, @RequestBody(required = false) CreateDraftRequest body) {
        return new ResponseEntity<>(service.createDraft(id, body), HttpStatus.CREATED);
    }

    @GetMapping("/{id}/versions/{vid}")
    public QuestionnaireDto getVersion(@PathVariable String id, @PathVariable String vid) {
        // id is included in the path for symmetry but the version id is
        // globally unique, so we resolve content from that alone.
        return service.getVersionContent(vid);
    }

    /** Edit a DRAFT's content. COMMITTED versions are immutable. */
    @PatchMapping("/{id}/versions/{vid}")
    public QuestionnaireDto editDraft(
            @PathVariable String id, @PathVariable String vid,
            @RequestBody QuestionnaireDto dto) {
        return service.updateDraftContent(vid, dto);
    }

    @PostMapping("/{id}/versions/{vid}/commit")
    public QuestionnaireVersionSummaryDto commitDraft(
            @PathVariable String id, @PathVariable String vid,
            @RequestBody CommitVersionRequest body) {
        return service.commitDraft(vid, body);
    }

    @DeleteMapping("/{id}/versions/{vid}")
    public ResponseEntity<Void> discardDraft(@PathVariable String id, @PathVariable String vid) {
        service.discardDraft(vid);
        return ResponseEntity.noContent().build();
    }
}
