package com.bodhpsychometric.controller.sync;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import java.util.Map;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.MemoryMeshRespondentSyncRequest;
import com.bodhpsychometric.dto.MemoryMeshRespondentSyncResponse;
import com.bodhpsychometric.security.SyncKeyGuard;
import com.bodhpsychometric.service.MemoryMeshSyncService;

import jakarta.validation.Valid;

/**
 * The door MemoryMesh knocks on to mirror a respondent it has just created.
 *
 * <p><b>Not a user endpoint.</b> No bearer token — the caller is a server —
 * so it sits on {@code ActorFilter}'s public list and is locked by
 * {@link SyncKeyGuard} (shared secret, constant-time compare, 403 for
 * everyone until configured).
 *
 * <p>Thin on purpose. Everything that touches the database is in
 * {@link MemoryMeshSyncService}, inside one transaction.
 */
@RestController
@RequestMapping("/api/sync/memorymesh")
public class MemoryMeshSyncController {

    /** Kept for callers and tests; the lock itself lives in {@link SyncKeyGuard}. */
    public static final String KEY_HEADER = SyncKeyGuard.KEY_HEADER;

    private final MemoryMeshSyncService service;
    private final SyncKeyGuard guard;

    public MemoryMeshSyncController(MemoryMeshSyncService service, SyncKeyGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    /** 201 when a respondent profile was written, 200 when the person was already one. */
    @PostMapping("/respondents")
    public ResponseEntity<?> upsertRespondent(
            @RequestHeader(value = KEY_HEADER, required = false) String presentedKey,
            @Valid @RequestBody MemoryMeshRespondentSyncRequest request) {
        ResponseEntity<?> rejected = guard.reject(presentedKey);
        if (rejected != null) {
            return rejected;
        }
        MemoryMeshRespondentSyncResponse response = service.sync(request);
        return ResponseEntity.status(response.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(response);
    }

    /**
     * Erase a respondent here because MemoryMesh's admin erased them there.
     * Deliberately cascading — see {@code MemoryMeshSyncService.deleteByEmail}
     * for why it does not refuse over held attempts.
     */
    @DeleteMapping("/respondents/by-email/{email}")
    public ResponseEntity<?> deleteByEmail(
            @RequestHeader(value = KEY_HEADER, required = false) String presentedKey,
            @PathVariable String email) {
        ResponseEntity<?> rejected = guard.reject(presentedKey);
        if (rejected != null) {
            return rejected;
        }
        boolean removed = service.deleteByEmail(email);
        return ResponseEntity.ok(Map.of("removed", removed, "email", email));
    }
}
