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
import com.bodhpsychometric.dto.ReportDraftEvaluationRequest;
import com.bodhpsychometric.dto.ReportDryRunRequest;
import com.bodhpsychometric.dto.ReportDryRunResponse;
import com.bodhpsychometric.dto.ReportRuleForkRequest;
import com.bodhpsychometric.dto.ReportRulePortabilityResponse;
import com.bodhpsychometric.dto.ReportRuleRequest;
import com.bodhpsychometric.dto.ReportRuleResponse;
import com.bodhpsychometric.dto.RuleTranslationRequest;
import com.bodhpsychometric.dto.RuleTranslationResponse;
import com.bodhpsychometric.dto.ScoringSheetImportRequest;
import com.bodhpsychometric.dto.ScoringSheetPreviewResponse;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.service.report.ReportColumnCatalog;
import com.bodhpsychometric.service.report.ReportDryRunService;
import com.bodhpsychometric.service.report.ReportRuleService;
import com.bodhpsychometric.service.report.RuleTranslationService;
import com.bodhpsychometric.service.report.ScoringSheetImportService;

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

    @Autowired
    private ReportDryRunService dryRunService;

    @Autowired
    private ScoringSheetImportService sheetImport;

    @Autowired
    private RuleTranslationService translation;

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
        // The rule being edited, when there is one: without it the checker
        // cannot tell a self-reference from a legitimate dependency.
        Object ruleId = body.get("reportRuleId");
        // Slugs of rules the caller is holding as unsaved formulae — a batch
        // of translation proposals — so one proposal may read another before
        // either is saved. Only the plain-language-dependency refusal relaxes.
        java.util.Set<String> pending = new java.util.LinkedHashSet<>();
        if (body.get("pendingExpressionSlugs") instanceof java.util.Collection<?> slugs) {
            for (Object slug : slugs) {
                if (slug != null && !String.valueOf(slug).isBlank()) {
                    pending.add(String.valueOf(slug).trim());
                }
            }
        }
        return ruleService.validateExpression(
                expr == null ? null : String.valueOf(expr),
                assessmentId == null ? null : Long.valueOf(String.valueOf(assessmentId)),
                organizationId == null ? null : Long.valueOf(String.valueOf(organizationId)),
                ruleId == null ? null : Long.valueOf(String.valueOf(ruleId)),
                pending);
    }

    /**
     * Run formulae that are NOT saved over the real cohort — "try it before
     * accepting". Writes nothing. See {@code ReportDryRunService#evaluateDrafts}.
     */
    @PostMapping("/evaluate-draft")
    public ReportDryRunResponse evaluateDraft(
            @Valid @RequestBody ReportDraftEvaluationRequest request) {
        return dryRunService.evaluateDrafts(request);
    }

    /** Whether this rule's columns all exist on a given assessment. */
    @GetMapping("/canRunOn/{id}")
    public Map<String, Boolean> canRunOn(@PathVariable Long id,
            @RequestParam Long assessmentId,
            @RequestParam(required = false) Long organizationId) {
        return Map.of("canRun", ruleService.canRunOn(id, assessmentId, organizationId));
    }

    /**
     * Every library rule judged against one assessment — the setup page's
     * picker.
     *
     * <p>Answers three ways, not two. "Every column resolves" misses the case
     * that costs the most: a rule whose keys all exist here but whose numbers
     * run over a different range than where it was written, so its band cuts
     * quietly mean something else. That comes back as SHAPE_MISMATCH with a
     * sentence saying which trait and by how much.
     */
    @GetMapping("/portability/getByAssessment/{assessmentId}")
    public List<ReportRulePortabilityResponse> portability(@PathVariable Long assessmentId,
            @RequestParam(required = false) Long organizationId) {
        return ruleService.portabilityFor(assessmentId, organizationId);
    }

    /** The authoring steps, in pipeline order. */
    @GetMapping("/stages")
    public List<String> stages() {
        return ReportRule.STAGES;
    }

    /**
     * Evaluate the rules over real respondents — no AI, no sandbox.
     *
     * <p><b>Not the delivery path.</b> Reports come from generated Python run
     * in the sandbox; this runs the expression grammar in Java. Two separate
     * implementations is the point — it is what makes this an oracle for the
     * generated code later — and it is why nothing here can approve anything.
     */
    @PostMapping("/dry-run")
    public ReportDryRunResponse dryRun(@Valid @RequestBody ReportDryRunRequest request) {
        return dryRunService.run(request);
    }

    /**
     * Whether AI translation is configured at all.
     *
     * <p>Asked BEFORE the button is drawn, so an install without a key hides
     * the feature rather than offering one that fails when pressed.
     */
    @GetMapping("/ai/available")
    public Map<String, Object> aiAvailable() {
        return Map.of("available", translation.isAvailable());
    }

    /**
     * Propose formulae for plain-language rules. <b>Saves nothing.</b>
     *
     * <p>Every proposal has already been through the same validator the save
     * path uses. Accepting one is an ordinary update, which checks it again —
     * there is deliberately no way to write a rule from here.
     */
    @PostMapping("/ai/translate")
    public RuleTranslationResponse translate(@Valid @RequestBody RuleTranslationRequest request) {
        return translation.propose(request);
    }

    /**
     * What a scoring workbook would create. Writes nothing.
     *
     * <p>Separate from the import itself because rule names are unique across
     * the installation: a clash is far cheaper to see on a preview screen than
     * to hit partway through writing twenty-two rows.
     */
    @PostMapping("/import/preview")
    public ScoringSheetPreviewResponse importPreview(
            @Valid @RequestBody ScoringSheetImportRequest request) {
        return sheetImport.preview(request);
    }

    /** Creates every rule in the sheet, or none of them. */
    @PostMapping("/import")
    public List<ReportRuleResponse> importSheet(
            @Valid @RequestBody ScoringSheetImportRequest request) {
        return sheetImport.importAll(request);
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

    /**
     * Copy a rule, and everything it reads, onto an assessment — the adopt
     * button behind the portability picker. All or nothing; a rule the target
     * cannot score fails the whole copy with the validator's own message.
     */
    @PostMapping("/fork/{id}")
    public List<ReportRuleResponse> fork(@PathVariable Long id,
            @Valid @RequestBody ReportRuleForkRequest request) {
        return ruleService.fork(id, request.assessmentId(), request.organizationId());
    }

    /** Refused with 409 while any computation pins a version of this rule. */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        ruleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
