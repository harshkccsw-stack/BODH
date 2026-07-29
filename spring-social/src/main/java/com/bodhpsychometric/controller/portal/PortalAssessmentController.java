package com.bodhpsychometric.controller.portal;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.PortalAssessmentDetailResponse;
import com.bodhpsychometric.service.PortalAssessmentService;

/**
 * Read side of the respondent take flow: one call returns everything the
 * portal renders for an attempt. The attempt gate (ownership + ACTIVE) and
 * content assembly live in {@link PortalAssessmentService}.
 */
@RestController
@RequestMapping("/api/portal/assessments")
public class PortalAssessmentController {

    @Autowired
    private PortalAssessmentService portalAssessmentService;

    /** The id is the attempt (RespondentAssessmentMapping), not the Assessment. */
    @GetMapping("/getById/{mappingId}")
    public PortalAssessmentDetailResponse getById(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return portalAssessmentService.getDetail(authorization, mappingId);
    }
}
