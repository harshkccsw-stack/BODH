package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.BulkRespondentDtos;
import com.bodhpsychometric.bodhassess.payload.LoginRequest;
import com.bodhpsychometric.bodhassess.payload.RespondentDto;
import com.bodhpsychometric.bodhassess.payload.RespondentLoginResponse;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.RespondentsService;

@RestController
@RequestMapping("/api/v1/respondents")
public class RespondentsController {

    @Autowired
    private RespondentsService service;

    @GetMapping
    public List<RespondentDto> list() { return service.list(); }

    @GetMapping("/{id}")
    public RespondentDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<RespondentDto> create(@RequestBody RespondentDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public RespondentDto update(@PathVariable String id, @RequestBody RespondentDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    public RespondentLoginResponse login(@RequestBody LoginRequest req) {
        return service.login(req);
    }

    @GetMapping("/me")
    public RespondentDto me(@CurrentUser UserPrincipal principal) {
        return service.me(principal);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bulk")
    public BulkRespondentDtos.Response bulkCreate(@RequestBody BulkRespondentDtos.Request req) {
        return service.bulkCreate(req);
    }
}
