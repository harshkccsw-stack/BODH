package com.bodhpsychometric.bodhassess.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AuthLoginRequest;
import com.bodhpsychometric.bodhassess.payload.AuthLoginResponse;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.AuthService;

/**
 * Unified login over the single {@code app_users} table. Both front-end login
 * pages (dashboard + assessment portal) post here; they differ only in where
 * they route the result.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    @Autowired
    private AuthService service;

    @PostMapping("/login")
    public AuthLoginResponse login(@RequestBody AuthLoginRequest req) {
        return service.login(req);
    }

    @GetMapping("/me")
    public AuthLoginResponse.AuthUser me(@CurrentUser UserPrincipal principal) {
        return service.me(principal);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }
}
