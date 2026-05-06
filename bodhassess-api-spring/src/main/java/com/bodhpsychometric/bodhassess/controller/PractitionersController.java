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

import com.bodhpsychometric.bodhassess.payload.LoginRequest;
import com.bodhpsychometric.bodhassess.payload.PractitionerDto;
import com.bodhpsychometric.bodhassess.payload.PractitionerLoginResponse;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.PractitionersService;

@RestController
@RequestMapping("/api/v1/practitioners")
public class PractitionersController {

    @Autowired
    private PractitionersService service;

    @GetMapping
    public List<PractitionerDto> list() { return service.list(); }

    @GetMapping("/{id}")
    public PractitionerDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<PractitionerDto> create(@RequestBody PractitionerDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public PractitionerDto update(@PathVariable String id, @RequestBody PractitionerDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    public PractitionerLoginResponse login(@RequestBody LoginRequest req) {
        return service.login(req);
    }

    @GetMapping("/me")
    public PractitionerLoginResponse.PractitionerMe me(@CurrentUser UserPrincipal principal) {
        return service.me(principal);
    }

    // JWT-based auth: logout is a client concern (drop the token).
    // Endpoint kept for API parity — returns 204 unconditionally.
    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }
}
