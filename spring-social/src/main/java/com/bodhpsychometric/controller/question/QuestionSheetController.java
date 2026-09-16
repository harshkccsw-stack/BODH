package com.bodhpsychometric.controller.question;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;

import com.bodhpsychometric.dto.PathResolveRequest;
import com.bodhpsychometric.dto.SheetMappingRequest;
import com.bodhpsychometric.dto.SheetMappingResponse;
import com.bodhpsychometric.dto.SheetMappingResponse.PathProposal;
import com.bodhpsychometric.security.ActorFilter;
import com.bodhpsychometric.service.question.sheet.SheetMappingService;

import jakarta.validation.Valid;

/**
 * Reading a question sheet that is not in our format.
 *
 * <p>Separate from {@link QuestionController} because it shares nothing with
 * it: no entity is touched here and nothing is written. What comes back is
 * rows of the ordinary template, which the caller reviews, edits, downloads or
 * submits through the normal import.
 *
 * <p><b>Signed in, always.</b> Unlike the rest of the question endpoints this
 * one spends money on every call, so it checks rather than waiting for the
 * security pass the other endpoints are still owed.
 */
@RestController
@RequestMapping("/api/questions/ai")
public class QuestionSheetController {

    @Autowired
    private SheetMappingService mapping;

    /**
     * Total CSV text accepted in one request. The whole workbook is posted
     * (only a sample goes on to the model), and a spreadsheet is small: the
     * reference workbook is ~15 KB across three tabs. Six million characters
     * is two orders of magnitude past any real instrument and well short of
     * something that would keep a thread busy parsing.
     */
    static final int MAX_CSV_CHARS = 6_000_000;

    /**
     * Whether this is configured at all.
     *
     * <p>Asked BEFORE the option is offered, so an install with no key shows
     * the template route alone rather than a button that fails when pressed.
     */
    @GetMapping("/available")
    public Map<String, Object> available() {
        return Map.of("available", mapping.isAvailable());
    }

    /**
     * A foreign workbook → rows of our template. <b>Writes nothing.</b>
     *
     * <p>The reply carries the mapping it used, in plain English, beside the
     * rows it produced. With no fixed expected shape that pairing is the only
     * place a wrong reading can be caught, which is why it travels with every
     * response rather than being available on request.
     */
    @PostMapping("/map-sheet")
    public ResponseEntity<?> mapSheet(@Valid @RequestBody SheetMappingRequest request) {
        if (!ActorFilter.current().isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Sign in to map a sheet"));
        }
        // Before the availability check: a body this size is refused whatever
        // the configuration, which also keeps the cap testable without a key.
        long chars = request.sheets().stream()
                .mapToLong(s -> s.csv() == null ? 0 : s.csv().length()).sum();
        if (chars > MAX_CSV_CHARS) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("message",
                    "This workbook is too large to map (" + (chars / 1_000_000) + " MB of cells). "
                            + "Upload the questions tab on its own, or use the template."));
        }
        if (!mapping.isAvailable()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("message",
                    "AI sheet mapping is not configured. Use the template instead, "
                            + "or set OPENAI_API_KEY on the server."));
        }
        SheetMappingResponse response = mapping.map(request);
        return ResponseEntity.ok(response);
    }

    /**
     * Resolve taxonomy paths against what exists. <b>No model, writes nothing,
     * costs nothing</b> — so, unlike {@code /map-sheet}, it is open like the
     * rest of the question endpoints.
     *
     * <p>Used by the review panel after it rewrites a path (re-anchoring one
     * the sheet rooted too shallowly). The §5.1 rule runs here and only here;
     * the browser asks rather than carrying a copy that would drift.
     */
    @PostMapping("/resolve-paths")
    public List<PathProposal> resolvePaths(@Valid @RequestBody PathResolveRequest request) {
        LinkedHashMap<String, Integer> counts = new LinkedHashMap<>();
        for (PathResolveRequest.PathCount p : request.paths()) {
            counts.merge(p.pathKey().trim(), p.questionCount() == null ? 0 : p.questionCount(),
                    Integer::sum);
        }
        return mapping.proposals(counts);
    }
}
