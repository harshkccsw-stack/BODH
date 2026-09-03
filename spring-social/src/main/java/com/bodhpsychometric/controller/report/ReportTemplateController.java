package com.bodhpsychometric.controller.report;

import java.util.List;
import java.util.Map;

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

import com.bodhpsychometric.dto.ReportTagBindingRequest;
import com.bodhpsychometric.dto.ReportTemplateRequest;
import com.bodhpsychometric.dto.ReportTemplateResponse;
import com.bodhpsychometric.service.report.ReportTemplateService;

import jakarta.validation.Valid;

/**
 * Report templates — the library, the editor, the tag checklist, publish, and
 * preview.
 *
 * <p>Rooted at {@code /api/report-templates} and deliberately <b>not</b> under
 * {@code /api/reports}, which {@code AssessmentReportController} already owns
 * with ten respondent-listing and XLSX-export endpoints. Nesting here would
 * collide with its {@code getById}-style paths.
 *
 * <p>Every rule lives in {@link ReportTemplateService}, including who is
 * allowed to call it.
 */
@RequestMapping("/api/report-templates")
@RestController
public class ReportTemplateController {

    @Autowired
    private ReportTemplateService templateService;

    /** The library. Omits each template's HTML — see the response DTO. */
    @GetMapping("/getAll")
    public List<ReportTemplateResponse> getAll() {
        return templateService.listAll();
    }

    /** One template, with its HTML, tag checklist and lint findings. */
    @GetMapping("/getById/{id}")
    public ReportTemplateResponse getById(@PathVariable Long id) {
        return templateService.get(id);
    }

    /**
     * What a CORE binding may print, as {@code key → label}. Served so the
     * authoring UI never hardcodes the list and cannot drift from the
     * validator that refuses an unknown key.
     */
    @GetMapping("/coreFields")
    public Map<String, String> coreFields() {
        return templateService.coreFields();
    }

    @PostMapping("/create")
    public ReportTemplateResponse create(@Valid @RequestBody ReportTemplateRequest request) {
        return templateService.create(request);
    }

    @PutMapping("/update/{id}")
    public ReportTemplateResponse update(@PathVariable Long id,
            @Valid @RequestBody ReportTemplateRequest request) {
        return templateService.update(id, request);
    }

    /**
     * Answer one tag. The tag is in the path because a binding exists only
     * because the parser found that tag in the HTML — it is addressed, not
     * created.
     */
    @PutMapping("/bindTag/{id}/{tag}")
    public ReportTemplateResponse bindTag(@PathVariable Long id, @PathVariable String tag,
            @Valid @RequestBody ReportTagBindingRequest request) {
        return templateService.bindTag(id, tag, request);
    }

    /** Freeze as renderable. Refuses unanswered tags and any lint ERROR. */
    @PostMapping("/publish/{id}")
    public ReportTemplateResponse publish(@PathVariable Long id) {
        return templateService.publish(id);
    }

    /**
     * Edit a published template — by copying it to a new DRAFT version, with
     * its tag answers carried across.
     *
     * <p>A published template is frozen so that reports already delivered from
     * it keep meaning what they said. This is therefore the only way to change
     * one, and it is what the "cannot be edited" message points at.
     */
    @PostMapping("/newVersion/{id}")
    public ReportTemplateResponse newVersion(@PathVariable Long id) {
        return templateService.newVersion(id);
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        templateService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * The layout as a PDF, filled with stand-in values. Inline rather than an
     * attachment so the browser's viewer shows it beside the editor.
     */
    @GetMapping("/preview/{id}.pdf")
    public ResponseEntity<byte[]> previewPdf(@PathVariable Long id) {
        byte[] pdf = templateService.previewPdf(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"template-" + id + "-preview.pdf\"")
                .body(pdf);
    }

    /**
     * The same preview as a page — the Interactive format.
     *
     * <p>The charset is explicit and load-bearing. {@code text/html} with no
     * charset is decoded as ISO-8859-1 by servlet containers and by some
     * browsers, which turns every Devanagari respondent name into mojibake —
     * the same class of failure as P0a's font findings, arriving through a
     * different door. The PDF path is immune because the bytes carry their own
     * encoding; this one is not.
     */
    @GetMapping(value = "/preview/{id}.html", produces = "text/html;charset=UTF-8")
    public ResponseEntity<String> previewHtml(@PathVariable Long id) {
        return ResponseEntity.ok()
                .contentType(new MediaType(MediaType.TEXT_HTML, java.nio.charset.StandardCharsets.UTF_8))
                .body(templateService.previewHtml(id));
    }
}
