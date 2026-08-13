package com.bodhpsychometric.controller;

import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.PortalAuthResponse;
import com.bodhpsychometric.dto.PortalLoginRequest;
import com.bodhpsychometric.dto.PortalLoginResponse;
import com.bodhpsychometric.dto.RegistrationSubmitRequest;
import com.bodhpsychometric.service.PortalAuthService;
import com.bodhpsychometric.service.PortalRegistrationService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/portal")
public class PortalAuthController {

    private final PortalAuthService auth;
    private final PortalRegistrationService registration;

    public PortalAuthController(PortalAuthService auth, PortalRegistrationService registration) {
        this.auth = auth;
        this.registration = registration;
    }

    /**
     * Self-registration from a shared link, and a sign-in in the same breath:
     * the response is the same {token, respondent} shape as /login, so the
     * portal stores the bearer and lands on /portal/assessment already
     * authenticated. The token in the path decides the organization — the body
     * cannot.
     *
     * Lives here rather than beside the token's resolve endpoint for a
     * structural reason: this class has NO class-level @Transactional, so the
     * catch below sits outside the service's transaction. Inside it, the
     * violation would mark the transaction rollback-only and 500 at commit
     * even after this returned 409.
     */
    @PostMapping("/register/{token}")
    public ResponseEntity<?> register(@PathVariable String token,
            @Valid @RequestBody RegistrationSubmitRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(registration.register(token, request));
        } catch (DataIntegrityViolationException e) {
            // Two people registering the same email in the same instant: both
            // clear the pre-check, the loser hits uqUserEmail (or the per-org
            // employee id key) at commit. Rare enough to answer with "try
            // again" rather than to lock against.
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "That email or Employee ID was just taken — please try again."));
        }
    }

    /** Identifier is an email or an employee id; dob is the password either way. */
    @PostMapping("/login")
    public PortalLoginResponse login(@Valid @RequestBody PortalLoginRequest request) {
        return auth.login(request.identifier(), request.dob());
    }

    /** Session restore: bearer token in, the signed-in respondent + allotted assessments out. */
    @GetMapping("/me")
    public PortalAuthResponse me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return auth.me(authorization);
    }
}
