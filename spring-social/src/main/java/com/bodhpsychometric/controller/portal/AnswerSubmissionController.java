package com.bodhpsychometric.controller.portal;

import java.net.http.HttpClient;

import org.apache.catalina.connector.Response;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;

@RequestMapping("/api/portal")
@RestController
public class AnswerSubmissionController {
    
    @Autowired
    private AssessmentAnswerRepository assessmentAnswerRepository;

    @Autowired
    private RespondentAssessmentMappingRepository respondentAssessmentMappingRepository;

    // @PostMapping("/submit/{assessmentId}/{respondentId}")
    // public ResponseEntity<?> submitAnswers(@PathVariable Long assessmentId, @PathVariable Long respondentId) {
        
    // }

}
