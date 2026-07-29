package com.bodhpsychometric.bodhassess.analytics.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.analytics.payload.AnalyticsQueryRequest;
import com.bodhpsychometric.bodhassess.analytics.service.QueryService;
import com.bodhpsychometric.bodhassess.payload.DatasetResponseDto;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/** Grouped aggregation queries powering KPIs, pivot tables, and charts. */
@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    @Autowired
    private QueryService service;

    @PostMapping("/query")
    public DatasetResponseDto query(@CurrentUser UserPrincipal principal,
                                    @RequestBody AnalyticsQueryRequest req) {
        return service.query(principal, req);
    }
}
