package com.bodhpsychometric.bodhassess.controller;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.service.HealthService;

@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    @Autowired
    private HealthService service;

    @GetMapping
    public ResponseEntity<Map<String, Object>> check() {
        Map<String, Object> body = service.check();
        boolean dbOk = Boolean.TRUE.equals(body.get("database"));
        return new ResponseEntity<>(body, dbOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    }
}
