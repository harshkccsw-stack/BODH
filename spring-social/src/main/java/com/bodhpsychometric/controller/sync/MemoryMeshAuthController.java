package com.bodhpsychometric.controller.sync;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.MemoryMeshAuthVerifyRequest;
import com.bodhpsychometric.security.SyncKeyGuard;
import com.bodhpsychometric.service.MemoryMeshSyncService;

import jakarta.validation.Valid;

/**
 * MemoryMesh's sign-in fallback: a person unknown there is checked against
 * the accounts here. No BodhAssess token is issued — the answer is the
 * profile, and MemoryMesh issues its own session. Key-locked like every sync
 * door; a failed check is the same 401 the portal login gives.
 */
@RestController
@RequestMapping("/api/sync/memorymesh/auth")
public class MemoryMeshAuthController {

    private final MemoryMeshSyncService service;
    private final SyncKeyGuard guard;

    public MemoryMeshAuthController(MemoryMeshSyncService service, SyncKeyGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @PostMapping("/verify")
    public ResponseEntity<?> verify(
            @RequestHeader(value = SyncKeyGuard.KEY_HEADER, required = false) String key,
            @Valid @RequestBody MemoryMeshAuthVerifyRequest request) {
        ResponseEntity<?> rejected = guard.reject(key);
        return rejected != null ? rejected : ResponseEntity.ok(service.verify(request));
    }
}
