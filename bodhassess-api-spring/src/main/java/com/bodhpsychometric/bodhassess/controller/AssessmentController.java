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
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AssessmentDto;
import com.bodhpsychometric.bodhassess.payload.AuditLogEntryDto;
import com.bodhpsychometric.bodhassess.service.AssessmentService;
import com.bodhpsychometric.bodhassess.service.AuditService;

/**
 * First-class Assessment endpoints — sit at /api/v1/assessment-records
 * to avoid colliding with the legacy /api/v1/assessments path (which is
 * the per-respondent session view). Frontend will adopt this prefix
 * during the refactor.
 */
@RestController
@RequestMapping("/api/v1/assessment-records")
public class AssessmentController {

    @Autowired private AssessmentService service;
    @Autowired private AuditService auditService;

    @GetMapping
    public List<AssessmentDto> list() { return service.list(); }

    @GetMapping("/{id}")
    public AssessmentDto get(@PathVariable String id) { return service.get(id); }

    // Every assessment in a questionnaire family — used by the pre-publish
    // popup to list (and let admins change the status of) assessments that
    // a new version commit might affect.
    @GetMapping("/by-questionnaire/{questionnaireId}")
    public List<AssessmentDto> listByQuestionnaire(@PathVariable String questionnaireId) {
        return service.listByQuestionnaire(questionnaireId);
    }

    @PostMapping
    public ResponseEntity<AssessmentDto> create(@RequestBody AssessmentDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public AssessmentDto update(@PathVariable String id, @RequestBody AssessmentDto dto) {
        return service.update(id, dto);
    }

    // Reversible state transition. Body: { "status": "ACTIVE|CLOSED|PAUSED" }.
    @PatchMapping("/{id}/status")
    public AssessmentDto updateStatus(@PathVariable String id, @RequestBody Map<String, String> body) {
        return service.updateStatus(id, body == null ? null : body.get("status"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    // Per-target audit trail surfaced as a tab on the assessment edit
    // page. Read-only.
    @GetMapping("/{id}/audit")
    public List<AuditLogEntryDto> audit(@PathVariable String id) {
        return auditService.listForTarget("assessment", id);
    }
}
