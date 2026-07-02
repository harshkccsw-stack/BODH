package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AssessmentSessionDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentGroupDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentSummaryDto;
import com.bodhpsychometric.bodhassess.payload.HeartbeatRequest;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.AssessmentsService;

@RestController
@RequestMapping("/api/v1/assessments")
public class AssessmentsController {

    @Autowired
    private AssessmentsService service;

    @GetMapping
    public List<AssessmentSessionDto> list(@RequestParam(value = "respondentId", required = false) String respondentId) {
        return service.list(respondentId);
    }

    // Lightweight projection for list views — id, name, respondent name,
    // instrument, vertical, status, score, createdAt. Skips the answers,
    // mqtScores, and demographics child collections that the full list
    // pulls. Use for the dashboard's Recent Assessments and any other
    // read-only table view; ?limit= keeps response size predictable.
    @GetMapping("/summaries")
    public List<AssessmentSummaryDto> listSummaries(
            @RequestParam(value = "respondentId", required = false) String respondentId,
            @RequestParam(value = "limit", required = false) Integer limit) {
        return service.listSummaries(respondentId, limit);
    }

    // Grouped — one row per assessmentId (the bulk-create group key) with
    // aggregate respondent and status counts. Drives the All Assessments
    // table once admins start grouping rather than viewing one row per
    // respondent.
    @GetMapping("/groups")
    public List<AssessmentGroupDto> listGroups() {
        return service.listGroups();
    }

    // Slim list filtered to a single assessmentId — drives the
    // /assessments/:assessmentId/respondents page (list of respondents +
    // status for one allotment).
    @GetMapping("/by-assessment")
    public List<AssessmentSummaryDto> listByAssessment(@RequestParam("assessmentId") String assessmentId) {
        return service.listSummariesByAssessment(assessmentId);
    }

    @GetMapping("/{id}")
    public AssessmentSessionDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<AssessmentSessionDto> create(@RequestBody AssessmentSessionDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @PostMapping("/bulk")
    public ResponseEntity<AssessmentSessionDto.BulkAssessmentResponse> bulkCreate(@RequestBody AssessmentSessionDto.BulkAssessmentRequest req) {
        return new ResponseEntity<>(service.bulkCreate(req.getAssessments()), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public AssessmentSessionDto update(@PathVariable String id, @RequestBody AssessmentSessionDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    // Reset a respondent's attempt — clears their previous answers/score and
    // returns the session to a fresh Active state so they can retake it.
    @PostMapping("/{id}/reset")
    public AssessmentSessionDto reset(@PathVariable String id) {
        return service.reset(id);
    }

    @PostMapping("/{id}/heartbeat")
    public ResponseEntity<Void> heartbeat(@PathVariable String id, @RequestBody HeartbeatRequest body,
                                          @CurrentUser UserPrincipal principal) {
        service.recordHeartbeat(id, body, principal);
        return ResponseEntity.noContent().build();
    }
}
