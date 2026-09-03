package com.bodhpsychometric.controller.report;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.ReportComputationRequest;
import com.bodhpsychometric.dto.ReportComputationResponse;
import com.bodhpsychometric.service.report.ReportComputationService;

import jakarta.validation.Valid;

/**
 * Computation drafts: rules + template + respondents + guidance, assembled into
 * a prompt that is ready to send.
 *
 * <p><b>There is no generate endpoint, deliberately.</b> No AI provider has
 * been chosen, so nothing here makes an outbound call and the backend still has
 * none anywhere. {@code markReady} is the ceiling; what a caller gets back is
 * the assembled prompt for a human to read.
 */
@RequestMapping("/api/report-computations")
@RestController
public class ReportComputationController {

    @Autowired
    private ReportComputationService computationService;

    @GetMapping("/getAll")
    public List<ReportComputationResponse> getAll() {
        return computationService.listAll();
    }

    /** One draft, with the assembled prompt and anything still blocking it. */
    @GetMapping("/getById/{id}")
    public ReportComputationResponse getById(@PathVariable Long id) {
        return computationService.get(id);
    }

    @PostMapping("/create")
    public ReportComputationResponse create(
            @Valid @RequestBody ReportComputationRequest request) {
        return computationService.create(request);
    }

    @PutMapping("/update/{id}")
    public ReportComputationResponse update(@PathVariable Long id,
            @Valid @RequestBody ReportComputationRequest request) {
        return computationService.update(id, request);
    }

    /**
     * Mark the draft complete.
     *
     * <p>This is NOT approval. It says the prompt has everything it needs;
     * the mandatory human review of generated output happens later and is not
     * reachable from here.
     */
    @PostMapping("/markReady/{id}")
    public ReportComputationResponse markReady(@PathVariable Long id) {
        return computationService.markReady(id);
    }

    @PostMapping("/reopen/{id}")
    public ReportComputationResponse reopen(@PathVariable Long id) {
        return computationService.reopen(id);
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        computationService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
