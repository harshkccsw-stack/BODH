package com.bodhpsychometric.bodhassess.controller;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AssessmentAllotteesDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentEntityAllotmentDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentGroupAllotmentDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentRespondentAllotmentDto;
import com.bodhpsychometric.bodhassess.service.AssessmentAllotmentsService;

/**
 * REST surface for the three allotee types — entities, groups,
 * individual respondents. The aggregated /allotees endpoint drives the
 * "Allotees" popup on the All Assessments table.
 */
@RestController
@RequestMapping("/api/v1/assessment-records/{assessmentId}/allotments")
public class AssessmentAllotmentsController {

    @Autowired private AssessmentAllotmentsService service;

    @GetMapping
    public AssessmentAllotteesDto listAllotees(@PathVariable String assessmentId) {
        return service.listAllotees(assessmentId);
    }

    // ---------- Entity allotments ----------
    @PostMapping("/entities")
    public ResponseEntity<AssessmentEntityAllotmentDto> addEntity(
            @PathVariable String assessmentId,
            @RequestBody AssessmentEntityAllotmentDto body) {
        return new ResponseEntity<>(
                service.addEntity(assessmentId, body.getEntityId(), body.getCap()),
                HttpStatus.CREATED);
    }

    @PatchMapping("/entities/{entityId}")
    public AssessmentEntityAllotmentDto updateEntityCap(
            @PathVariable String assessmentId,
            @PathVariable String entityId,
            @RequestBody Map<String, Integer> body) {
        return service.updateEntityCap(assessmentId, entityId, body == null ? null : body.get("cap"));
    }

    @DeleteMapping("/entities/{entityId}")
    public ResponseEntity<Void> removeEntity(
            @PathVariable String assessmentId, @PathVariable String entityId) {
        service.removeEntity(assessmentId, entityId);
        return ResponseEntity.noContent().build();
    }

    // ---------- Group allotments ----------
    @PostMapping("/groups")
    public ResponseEntity<AssessmentGroupAllotmentDto> addGroup(
            @PathVariable String assessmentId,
            @RequestBody AssessmentGroupAllotmentDto body) {
        return new ResponseEntity<>(
                service.addGroup(assessmentId, body.getGroupId()),
                HttpStatus.CREATED);
    }

    @DeleteMapping("/groups/{groupId}")
    public ResponseEntity<Void> removeGroup(
            @PathVariable String assessmentId, @PathVariable String groupId) {
        service.removeGroup(assessmentId, groupId);
        return ResponseEntity.noContent().build();
    }

    // ---------- Individual respondent allotments ----------
    @PostMapping("/respondents")
    public ResponseEntity<AssessmentRespondentAllotmentDto> addRespondent(
            @PathVariable String assessmentId,
            @RequestBody AssessmentRespondentAllotmentDto body) {
        return new ResponseEntity<>(
                service.addRespondent(assessmentId, body.getRespondentId()),
                HttpStatus.CREATED);
    }

    @DeleteMapping("/respondents/{respondentId}")
    public ResponseEntity<Void> removeRespondent(
            @PathVariable String assessmentId, @PathVariable String respondentId) {
        service.removeRespondent(assessmentId, respondentId);
        return ResponseEntity.noContent().build();
    }
}
