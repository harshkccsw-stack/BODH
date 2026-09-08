package com.bodhpsychometric.controller.report;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
import com.bodhpsychometric.service.report.ReportDeliveryService;

import jakarta.validation.Valid;

/**
 * Computation drafts: rules + template + respondents + guidance, assembled into
 * a prompt that is ready to send.
 *
 * <p><b>Nothing here makes an outbound call.</b> No AI provider has been
 * chosen and the backend still has no outbound HTTP anywhere. For a computation
 * whose every rule is a formula that costs nothing: {@code approve} and
 * {@code generate} deliver real PDFs from the rules themselves, evaluated in
 * Java. {@code markReady} remains the ceiling for one that needs a model.
 */
@RequestMapping("/api/report-computations")
@RestController
public class ReportComputationController {

    @Autowired
    private ReportComputationService computationService;

    @Autowired
    private ReportDeliveryService deliveryService;

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

    /**
     * Approve a DIRECT computation for delivery.
     *
     * <p>Unlike {@code markReady}, this one IS approval — it is what
     * {@code generate} requires. See {@code ReportComputationService.approve}
     * for why a formula still needs a person to sign it off.
     */
    @PostMapping("/approve/{id}")
    public ReportComputationResponse approve(@PathVariable Long id) {
        return computationService.approve(id);
    }

    /**
     * One respondent's real report, for checking before approving.
     *
     * <p>Inline so it opens in the browser's viewer beside the computation.
     * Deliberately allowed before approval: looking at a real report is how
     * somebody decides whether to approve one.
     */
    @GetMapping("/preview/{id}/{attemptId}.pdf")
    public ResponseEntity<byte[]> preview(@PathVariable Long id, @PathVariable Long attemptId) {
        ReportDeliveryService.Report report = deliveryService.preview(id, attemptId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"" + report.fileName() + "\"")
                .body(report.pdf());
    }

    /**
     * Every completed respondent's report, as a ZIP.
     *
     * <p>The counts ride in headers rather than the body because the body is
     * the archive. {@code X-Report-Skipped} is the one worth surfacing: it is
     * how many people were allotted the assessment but have not finished it,
     * and an operator expecting 50 reports and receiving 38 should be able to
     * see why without opening anything.
     */
    @PostMapping("/generate/{id}")
    public ResponseEntity<byte[]> generate(@PathVariable Long id) {
        ReportDeliveryService.Batch batch = deliveryService.generate(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + batch.fileName() + "\"")
                .header("X-Report-Count", String.valueOf(batch.reportCount()))
                .header("X-Report-Skipped", String.valueOf(batch.skipped()))
                .body(batch.zip());
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
