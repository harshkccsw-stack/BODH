package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AuditLogEntryDto;
import com.bodhpsychometric.bodhassess.service.AuditService;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditLogController {

    @Autowired private AuditService service;

    @GetMapping
    public List<AuditLogEntryDto> recent() { return service.listAll(); }

    @GetMapping("/{targetType}/{targetId}")
    public List<AuditLogEntryDto> byTarget(
            @PathVariable String targetType, @PathVariable String targetId) {
        return service.listForTarget(targetType, targetId);
    }
}
