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

import com.bodhpsychometric.bodhassess.payload.AssessmentDto;
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
    public List<AssessmentDto> list(@RequestParam(value = "respondentId", required = false) String respondentId) {
        return service.list(respondentId);
    }

    @GetMapping("/{id}")
    public AssessmentDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<AssessmentDto> create(@RequestBody AssessmentDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @PostMapping("/bulk")
    public ResponseEntity<AssessmentDto.BulkAssessmentResponse> bulkCreate(@RequestBody AssessmentDto.BulkAssessmentRequest req) {
        return new ResponseEntity<>(service.bulkCreate(req.getAssessments()), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public AssessmentDto update(@PathVariable String id, @RequestBody AssessmentDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/heartbeat")
    public ResponseEntity<Void> heartbeat(@PathVariable String id, @RequestBody HeartbeatRequest body,
                                          @CurrentUser UserPrincipal principal) {
        service.recordHeartbeat(id, body, principal);
        return ResponseEntity.noContent().build();
    }
}
