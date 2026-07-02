package com.bodhpsychometric.bodhassess.controller;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.SessionDtos;
import com.bodhpsychometric.bodhassess.service.SessionsService;

@RestController
@RequestMapping("/api/v1/sessions")
public class SessionsController {

    @Autowired
    private SessionsService service;

    @GetMapping
    public SessionDtos.SessionListResponse list(
            @RequestParam(value = "vertical", required = false) String vertical,
            @RequestParam(value = "status", required = false) String status) {
        return service.list(vertical, status);
    }

    @PostMapping
    public ResponseEntity<SessionDtos.CreateSessionResponse> create(@RequestBody SessionDtos.CreateSessionRequest req) {
        return new ResponseEntity<>(service.create(req), HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        return service.get(id);
    }
}
