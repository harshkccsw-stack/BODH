package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AssessmentTokenDto;
import com.bodhpsychometric.bodhassess.service.AssessmentTokenService;

/**
 * Token CRUD. The admin-facing endpoints sit under /api/v1/assessment-tokens
 * (auth-required); the public resolve + consume endpoints live under
 * /api/v1/public/tokens so SecurityConfig can permitAll just those two
 * without exposing the rest.
 */
@RestController
@RequestMapping("/api/v1/assessment-tokens")
public class AssessmentTokensController {

    @Autowired private AssessmentTokenService service;

    @PostMapping
    public ResponseEntity<AssessmentTokenDto> issue(@RequestBody AssessmentTokenDto body) {
        return new ResponseEntity<>(service.issue(body), HttpStatus.CREATED);
    }

    @GetMapping("/by-assessment/{assessmentId}")
    public List<AssessmentTokenDto> listForAssessment(@PathVariable String assessmentId) {
        return service.listForAssessment(assessmentId);
    }

    @DeleteMapping("/{token}")
    public ResponseEntity<Void> revoke(@PathVariable String token) {
        service.revoke(token);
        return ResponseEntity.noContent().build();
    }
}
