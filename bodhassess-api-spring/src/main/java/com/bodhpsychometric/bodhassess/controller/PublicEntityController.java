package com.bodhpsychometric.bodhassess.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.PublicRegistrationDto;
import com.bodhpsychometric.bodhassess.service.PublicRegistrationService;

/**
 * Anonymous endpoints behind an entity's shareable "member link". The
 * /entity/:id/register page resolves the entity name to title the form,
 * then posts the member's details to join that entity. SecurityConfig
 * permitAll's /api/v1/public/** so no auth is required.
 */
@RestController
@RequestMapping("/api/v1/public/entities")
public class PublicEntityController {

    @Autowired
    private PublicRegistrationService registrationService;

    /** Public name lookup so the form can render "Register to <name>". */
    @GetMapping("/{entityId}")
    public PublicRegistrationDto.EntityInfo resolve(@PathVariable String entityId) {
        return registrationService.resolveEntityPublic(entityId);
    }

    /**
     * Self-register a member into the entity. Creates the respondent, links
     * them into the entity, and mirrors them into the identity table so they
     * can log in to the portal with email + dob. Returns 409 if the person
     * already has an account.
     */
    @PostMapping("/{entityId}/register")
    public ResponseEntity<PublicRegistrationDto.EntityMemberResult> register(
            @PathVariable String entityId,
            @RequestBody PublicRegistrationDto body) {
        return new ResponseEntity<>(
                registrationService.registerEntityMember(entityId, body), HttpStatus.CREATED);
    }
}
