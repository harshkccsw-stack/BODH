package com.bodhpsychometric.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.LoginRequest;
import com.bodhpsychometric.dto.PortalAuthResponse;
import com.bodhpsychometric.dto.PortalLoginResponse;
import com.bodhpsychometric.service.PortalAuthService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/portal")
public class PortalAuthController {

    private final PortalAuthService auth;

    public PortalAuthController(PortalAuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/login")
    public PortalLoginResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request.email(), request.dob());
    }

    /** Session restore: bearer token in, the signed-in respondent + allotted assessments out. */
    @GetMapping("/me")
    public PortalAuthResponse me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return auth.me(authorization);
    }
}
