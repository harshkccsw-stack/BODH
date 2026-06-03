package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.EntityRegistrationDto;
import com.bodhpsychometric.bodhassess.service.EntityRegistrationsService;

@RestController
@RequestMapping("/api/v1/entity-registrations")
public class EntityRegistrationsController {

    @Autowired
    private EntityRegistrationsService service;

    /** Admin-only — listing every self-signup for review. */
    @GetMapping
    public List<EntityRegistrationDto> list() {
        return service.list();
    }

    /** Admin-only — single record. */
    @GetMapping("/{id}")
    public EntityRegistrationDto get(@PathVariable String id) {
        return service.get(id);
    }

    /**
     * Public — the self-registration form. Allowed without auth via
     * SecurityConfig. Rejects duplicates by email.
     */
    @PostMapping
    public ResponseEntity<EntityRegistrationDto> create(@RequestBody EntityRegistrationDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    /**
     * Admin-only PATCH-style update for the gates the dashboard manages —
     * `active` and `memberIds`. Any field left null on the dto is preserved
     * as-is on the row.
     *
     * NOTE: per-(entity, assessment) caps live on
     * /api/v1/assessment-records/{aid}/allotments/entities/{eid} now and
     * are NOT touched by this endpoint.
     */
    @PatchMapping("/{id}")
    public EntityRegistrationDto adminUpdate(@PathVariable String id, @RequestBody EntityRegistrationDto dto) {
        return service.adminUpdate(id, dto);
    }

    /** Admin-only — discard a registration (e.g. spam or duplicate). */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
