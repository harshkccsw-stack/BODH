package com.bodhpsychometric.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.AuthUserResponse;
import com.bodhpsychometric.dto.LoginRequest;
import com.bodhpsychometric.dto.LoginResponse;
import com.bodhpsychometric.service.DashboardAuthService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class DashboardAuthController {

    private final DashboardAuthService auth;

    public DashboardAuthController(DashboardAuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request.email(), request.dob());
    }

    /** Session restore: bearer token in, the signed-in identity out. */
    @GetMapping("/me")
    public AuthUserResponse me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return auth.me(authorization);
    }
}
