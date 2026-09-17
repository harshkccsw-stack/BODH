package com.bodhpsychometric.controller.sync;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.BaselineAnswerSyncRequest;
import com.bodhpsychometric.dto.BaselineQuestionSyncRequest;
import com.bodhpsychometric.security.SyncKeyGuard;
import com.bodhpsychometric.service.BaselineSyncService;

import jakarta.validation.Valid;

/**
 * The baseline doors MemoryMesh knocks on: fetch the questions, replace the
 * questions, store a respondent's answers. Server-to-server, so on
 * {@code ActorFilter}'s public list and locked by {@link SyncKeyGuard}.
 */
@RestController
@RequestMapping("/api/sync/memorymesh/baseline")
public class MemoryMeshBaselineController {

    private final BaselineSyncService service;
    private final SyncKeyGuard guard;

    public MemoryMeshBaselineController(BaselineSyncService service, SyncKeyGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/questions")
    public ResponseEntity<?> questions(
            @RequestHeader(value = SyncKeyGuard.KEY_HEADER, required = false) String key) {
        ResponseEntity<?> rejected = guard.reject(key);
        return rejected != null ? rejected : ResponseEntity.ok(service.list());
    }

    /** Replace-all, ordered by array index; element checks are in the service. */
    @PutMapping("/questions")
    public ResponseEntity<?> replaceQuestions(
            @RequestHeader(value = SyncKeyGuard.KEY_HEADER, required = false) String key,
            @RequestBody List<BaselineQuestionSyncRequest> body) {
        ResponseEntity<?> rejected = guard.reject(key);
        return rejected != null ? rejected : ResponseEntity.ok(service.replace(body));
    }

    @PostMapping("/answers")
    public ResponseEntity<?> storeAnswers(
            @RequestHeader(value = SyncKeyGuard.KEY_HEADER, required = false) String key,
            @Valid @RequestBody BaselineAnswerSyncRequest body) {
        ResponseEntity<?> rejected = guard.reject(key);
        return rejected != null ? rejected : ResponseEntity.ok(service.storeAnswers(body));
    }
}
