package com.bodhpsychometric.controller.portal;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.PortalAttemptStatusResponse;
import com.bodhpsychometric.dto.PortalBeginRequest;
import com.bodhpsychometric.dto.PortalSubmitRequest;
import com.bodhpsychometric.service.PortalAssessmentService;

/**
 * Write side of the respondent take flow. Two calls per attempt:
 * begin (demographic form + consent, NOT_STARTED → ONGOING) and submit
 * (every answer at once, ONGOING → COMPLETED). All rules live in
 * {@link PortalAssessmentService}.
 */
@RequestMapping("/api/portal")
@RestController
public class AnswerSubmissionController {

    @Autowired
    private PortalAssessmentService portalAssessmentService;

    @PostMapping("/assessments/begin/{mappingId}")
    public PortalAttemptStatusResponse begin(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) PortalBeginRequest request) {
        return portalAssessmentService.begin(authorization, mappingId, request);
    }

    @PostMapping("/assessments/submit/{mappingId}")
    public PortalAttemptStatusResponse submit(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) PortalSubmitRequest request) {
        return portalAssessmentService.submit(authorization, mappingId, request);
    }
}
