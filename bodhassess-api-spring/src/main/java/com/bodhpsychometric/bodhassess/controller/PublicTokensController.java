package com.bodhpsychometric.bodhassess.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.bind.annotation.RequestBody;

import com.bodhpsychometric.bodhassess.payload.AssessmentTokenDto;
import com.bodhpsychometric.bodhassess.payload.PublicRegistrationDto;
import com.bodhpsychometric.bodhassess.service.AssessmentTokenService;
import com.bodhpsychometric.bodhassess.service.PublicRegistrationService;

/**
 * Token endpoints reachable WITHOUT authentication — the /register page
 * uses them to resolve the link's context and then consume the token
 * once the registration succeeds. SecurityConfig permitAll's this path
 * prefix so anonymous browsers can hit it.
 */
@RestController
@RequestMapping("/api/v1/public/tokens")
public class PublicTokensController {

    @Autowired private AssessmentTokenService service;
    @Autowired private PublicRegistrationService registrationService;

    @GetMapping("/{token}")
    public AssessmentTokenDto resolve(@PathVariable String token) {
        return service.resolve(token);
    }

    @PostMapping("/{token}/consume")
    public AssessmentTokenDto consume(@PathVariable String token) {
        return service.consume(token);
    }

    /**
     * Single-call registration: creates respondent (or reuses), links
     * into entity members if scoped, enforces cap, creates the session,
     * consumes the token. Returns the new sessionId so the SPA can
     * redirect into the take view.
     */
    @PostMapping("/{token}/register")
    public PublicRegistrationDto.Result register(
            @PathVariable String token,
            @RequestBody PublicRegistrationDto body) {
        return registrationService.register(token, body);
    }
}
