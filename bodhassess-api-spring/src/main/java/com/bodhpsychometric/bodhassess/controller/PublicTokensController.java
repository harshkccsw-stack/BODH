package com.bodhpsychometric.bodhassess.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
     * QR code (PNG) for the token's registration link. Generated once and
     * persisted on the token row, so repeat downloads stream the same bytes.
     * {@code base} carries the front-end origin so the encoded link points at
     * the right host; the SPA passes window.location.origin.
     */
    @GetMapping(value = "/{token}/qr", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> qr(@PathVariable String token,
                                     @RequestParam(value = "base", required = false) String base) {
        byte[] png = service.qrPng(token, base);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"assessment-qr.png\"")
                .contentType(MediaType.IMAGE_PNG)
                .body(png);
    }

    /**
     * Pre-registration duplicate check used by the public /register page: a
     * person already exists when their DOB matches AND any of email / phone /
     * company id matches. The page uses this to prompt "log in" instead of
     * creating a second account.
     */
    @PostMapping("/registration-check")
    public PublicRegistrationDto.CheckResult registrationCheck(@RequestBody PublicRegistrationDto body) {
        return registrationService.checkExisting(body);
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

    /**
     * Existing-account path for a register-kind link: when the registrant is
     * recognised, they confirm email + dob and we sign them in, link them into
     * the token's entity/group, ensure the session, and return it — so a known
     * entity member lands straight in the assessment, not the dashboard.
     */
    @PostMapping("/{token}/login")
    public PublicRegistrationDto.Result loginExisting(
            @PathVariable String token,
            @RequestBody PublicRegistrationDto body) {
        return registrationService.loginExisting(token, body);
    }
}
