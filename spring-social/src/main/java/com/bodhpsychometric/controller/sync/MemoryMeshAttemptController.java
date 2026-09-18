package com.bodhpsychometric.controller.sync;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.MemoryMeshAttemptSyncRequest;
import com.bodhpsychometric.security.SyncKeyGuard;
import com.bodhpsychometric.service.MemoryMeshAttemptSyncService;

import jakarta.validation.Valid;

/**
 * A completed attempt of an assessment imported to MemoryMesh, mirrored back
 * here so our Reports show it. Key-locked like every sync door.
 */
@RestController
@RequestMapping("/api/sync/memorymesh/attempts")
public class MemoryMeshAttemptController {

    private final MemoryMeshAttemptSyncService service;
    private final SyncKeyGuard guard;

    public MemoryMeshAttemptController(MemoryMeshAttemptSyncService service, SyncKeyGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @PostMapping
    public ResponseEntity<?> store(
            @RequestHeader(value = SyncKeyGuard.KEY_HEADER, required = false) String key,
            @Valid @RequestBody MemoryMeshAttemptSyncRequest request) {
        ResponseEntity<?> rejected = guard.reject(key);
        return rejected != null ? rejected : ResponseEntity.ok(service.store(request));
    }
}
