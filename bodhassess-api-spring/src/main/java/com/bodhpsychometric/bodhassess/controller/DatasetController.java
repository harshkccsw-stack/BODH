package com.bodhpsychometric.bodhassess.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.DatasetResponseDto;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.DatasetService;

/**
 * Generic, self-describing "dataset" endpoints that back the in-app data grid.
 * Each view returns its own column metadata plus flat rows, so the frontend
 * grid renders dynamic score / demographic columns without code changes.
 */
@RestController
@RequestMapping("/api/v1/datasets")
public class DatasetController {

    @Autowired
    private DatasetService service;

    /** Sessions/Results view: one row per completed/assigned assessment. */
    @GetMapping("/sessions")
    public DatasetResponseDto sessions(
            @CurrentUser UserPrincipal principal,
            @RequestParam(value = "entityId", required = false) String entityId,
            @RequestParam(value = "questionnaireId", required = false) String questionnaireId) {
        return service.sessions(principal, entityId, questionnaireId);
    }
}
