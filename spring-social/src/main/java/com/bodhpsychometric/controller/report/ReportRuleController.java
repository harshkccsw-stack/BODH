package com.bodhpsychometric.controller.report;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.DsExprResponse;
import com.bodhpsychometric.dto.ReportRuleRequest;
import com.bodhpsychometric.dto.ReportRuleResponse;
import com.bodhpsychometric.service.report.ReportColumnCatalog;
import com.bodhpsychometric.service.report.ReportRuleService;

import jakarta.validation.Valid;

/**
 * The rules library — named, reusable scoring and interpretation logic.
 *
 * <p>Rooted at {@code /api/report-rules}, alongside {@code /api/report-templates}
 * and clear of {@code /api/reports}, which the respondent-listing and export
 * endpoints already own.
 */
@RequestMapping("/api/report-rules")
@RestController
public class ReportRuleController {

    @Autowired
    private ReportRuleService ruleService;

    @GetMapping("/getAll")
    public List<ReportRuleResponse> getAll() {
        return ruleService.listAll();
    }

    @GetMapping("/getById/{id}")
    public ReportRuleResponse getById(@PathVariable Long id) {
        return ruleService.get(id);
    }

    /**
     * The MQ/MQT picker's source: the columns THIS assessment actually exposes,
     * read live.
     *
     * <p>Per assessment and never cached, because score columns come from the
     * questions placed in the questionnaire — a static list would let somebody
     * build a rule that looks valid and breaks the moment it runs somewhere
     * else.
     */
    @GetMapping("/columns/getByAssessment/{assessmentId}")
    public List<ReportColumnCatalog.ReportColumn> columns(
            @PathVariable Long assessmentId,
            @RequestParam(required = false) Long organizationId) {
        return ruleService.columnsFor(assessmentId, organizationId);
    }

    /**
     * Live formula checking for the editor.
     *
     * <p>Answers <b>HTTP 200 with {@code errors[]}</b>, never an error status —
     * a half-typed formula is a normal state, and Data Studio's editor behaves
     * the same way for the same reason.
     */
    @PostMapping("/validate-expression")
    public DsExprResponse validateExpression(@RequestBody Map<String, Object> body) {
        Object expr = body.get("expression");
        Object assessmentId = body.get("assessmentId");
        Object organizationId = body.get("organizationId");
        return ruleService.validateExpression(
                expr == null ? null : String.valueOf(expr),
                assessmentId == null ? null : Long.valueOf(String.valueOf(assessmentId)),
                organizationId == null ? null : Long.valueOf(String.valueOf(organizationId)));
    }

    /** Whether this rule's columns all exist on a given assessment. */
    @GetMapping("/canRunOn/{id}")
    public Map<String, Boolean> canRunOn(@PathVariable Long id,
            @RequestParam Long assessmentId,
            @RequestParam(required = false) Long organizationId) {
        return Map.of("canRun", ruleService.canRunOn(id, assessmentId, organizationId));
    }

    @PostMapping("/create")
    public ReportRuleResponse create(@Valid @RequestBody ReportRuleRequest request) {
        return ruleService.create(request);
    }

    /** Saving writes a NEW immutable version; the old one is never touched. */
    @PutMapping("/update/{id}")
    public ReportRuleResponse update(@PathVariable Long id,
            @Valid @RequestBody ReportRuleRequest request) {
        return ruleService.update(id, request);
    }

    @PostMapping("/archive/{id}")
    public ReportRuleResponse archive(@PathVariable Long id) {
        return ruleService.archive(id);
    }

    /** Refused with 409 while any computation pins a version of this rule. */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        ruleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
