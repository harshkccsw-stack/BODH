package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.LiveAssessmentSummary;
import com.bodhpsychometric.bodhassess.payload.LiveSessionDto;
import com.bodhpsychometric.bodhassess.service.LiveTrackingService;

@RestController
@RequestMapping("/api/v1/admin/live-tracking")
@PreAuthorize("hasRole('ADMIN')")
public class LiveTrackingController {

    @Autowired
    private LiveTrackingService service;

    @GetMapping("/assessments")
    public List<LiveAssessmentSummary> assessments() {
        return service.listAssessments();
    }

    @GetMapping("/assessments/sessions")
    public List<LiveSessionDto> sessions(@RequestParam("instrument") String instrument,
                                         @RequestParam(value = "groupId", required = false) String groupId) {
        return service.listSessions(instrument, groupId);
    }
}
