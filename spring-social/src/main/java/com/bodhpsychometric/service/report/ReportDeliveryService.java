package com.bodhpsychometric.service.report;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.report.ReportComputation;
import com.bodhpsychometric.model.report.ReportComputationRule;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.report.ReportComputationRepository;

/**
 * Turning an approved DIRECT computation into actual PDFs.
 *
 * <h2>The whole delivery path, and what it deliberately is not</h2>
 *
 * <p>Evaluate the pinned rules over the cohort → resolve each respondent's
 * template tags → render. No model, no sandbox, no generated code: this mode
 * exists precisely for computations whose every rule is an expression, and an
 * expression cannot import, loop, or reach the filesystem or the network. The
 * apparatus the build plan specifies around generated Python — container
 * isolation, an import allowlist, banned clock and RNG calls, a pinned
 * interpreter digest — is not skipped here, it is inapplicable.
 *
 * <h2>Four things that are load-bearing</h2>
 *
 * <ol>
 *   <li><b>Pinned versions, never latest.</b> Delivery runs
 *       {@link ReportDryRunService#evaluatePinned}, so what a human approved is
 *       what executes. Somebody editing a rule in the library afterwards changes
 *       nothing here — that is the entire point of pinning, and reading latest
 *       would quietly undo the approval.</li>
 *   <li><b>The cohort is the whole cohort; the recipients are not.</b> Rules are
 *       evaluated over every row the dataset returns, exactly as the dry run
 *       does, because a percentile computed over a different population is a
 *       different number and the two screens must not disagree. Only COMPLETED
 *       attempts then RECEIVE a report — a partial protocol has no business
 *       being written up.</li>
 *   <li><b>A failed rule stops delivery, it does not blank a tag.</b> Data
 *       Studio writes null into a cell and carries on, which is right for a
 *       spreadsheet. Here a missing score is a wrong report, and a wrong report
 *       is handed to a person.</li>
 *   <li><b>The values travel with the PDFs.</b> A re-attempt hard-deletes the
 *       answers behind a report ({@code AssessmentReportService.resetAssessment}
 *       archives nothing), so the numbers a report was built from are evidence
 *       that cannot be re-derived later. Every batch therefore carries a
 *       {@code values.json} manifest. It is a snapshot in the operator's hands,
 *       NOT server-side persistence — see the class note below.</li>
 * </ol>
 *
 * <h2>Not yet persisted</h2>
 *
 * <p>There is no {@code generated_report} table and no stored PDF: the batch is
 * streamed to the caller as a ZIP. That is a deliberate stopping point rather
 * than an oversight — persisting reports needs both a migration and the
 * {@code app-uploads} volume that {@code docker-compose.yml} still has commented
 * out, and a PDF written to a container filesystem that a redeploy erases would
 * be worse than one never written at all.
 */
@Service
@Transactional(readOnly = true)
public class ReportDeliveryService {

    private final ReportComputationRepository computations;
    private final RespondentAssessmentMappingRepository attempts;
    private final ReportDryRunService dryRun;
    private final ReportCoreResolver core;
    private final ReportValueResolver values;
    private final TemplateTagParser parser;
    private final ReportRenderer renderer;
    private final ReportAccess access;
    private final ReportNarrativeService narrativeService;

    public ReportDeliveryService(ReportComputationRepository computations,
            RespondentAssessmentMappingRepository attempts,
            ReportDryRunService dryRun,
            ReportCoreResolver core,
            ReportValueResolver values,
            TemplateTagParser parser,
            ReportRenderer renderer,
            ReportAccess access,
            ReportNarrativeService narrativeService) {
        this.computations = computations;
        this.attempts = attempts;
        this.dryRun = dryRun;
        this.core = core;
        this.values = values;
        this.parser = parser;
        this.renderer = renderer;
        this.access = access;
        this.narrativeService = narrativeService;
    }

    /** One respondent's report, as a ZIP entry name and its bytes. */
    public record Report(Long attemptId, String respondentName, String fileName, byte[] pdf,
            Map<String, Object> values) {
    }

    /** A whole batch, ready to stream. */
    public record Batch(String fileName, byte[] zip, int reportCount, int skipped) {
    }

    /**
     * One report, for one attempt — the honest preview.
     *
     * <p>Renders through the same path a batch does, with that respondent's real
     * values, so what the author checks is the artifact and not an impression of
     * it. Allowed on a computation that is not yet APPROVED: seeing a real report
     * is how somebody decides whether to approve, and requiring approval first
     * would make the gate meaningless.
     */
    // Writable, unlike the class default. Generating a narrative STORES it, and
    // a readOnly transaction sets the flush mode to MANUAL — the save would be
    // dropped without an error and every render would silently buy the prose
    // again. Reads are still the overwhelming majority here, hence the override
    // sitting on the two methods that write rather than on the class.
    @Transactional
    public Report preview(Long computationId, Long attemptId) {
        access.requireRenderer();
        ReportComputation computation = load(computationId);
        ReportTemplate template = requireTemplate(computation);

        ReportDryRunService.EvaluatedCohort cohort = evaluate(computation);
        RespondentAssessmentMapping attempt = attempts.findById(attemptId)
                .orElseThrow(() -> new NotFoundException("Attempt " + attemptId + " not found"));
        if (!attempt.getAssessment().getAssessmentId().equals(computation.getAssessmentId())) {
            throw new IllegalArgumentException(
                    "That attempt belongs to a different assessment.");
        }

        Map<String, Object> ruleValues = rowFor(cohort, attemptId);
        if (ruleValues == null) {
            throw new IllegalStateException("This respondent has no scored row on this "
                    + "assessment, so there is nothing to report.");
        }
        // A preview writes and STORES its narratives, exactly as a batch does,
        // so that what somebody approves is what later gets delivered. Cheaper
        // too — the batch reuses this respondent's paragraph instead of buying
        // it twice. To get different wording, clear the prose and preview again.
        Map<String, String> narratives = narrativeService
                .resolveForCohort(computation, template, Map.of(attemptId, ruleValues))
                .getOrDefault(attemptId, Map.of());
        return render(template, attempt, ruleValues, narratives);
    }

    /**
     * Every completed attempt, as a ZIP of PDFs plus the values manifest.
     *
     * <p>APPROVED is required here and nowhere else. A preview is somebody
     * looking; a batch is documents about real people leaving the building.
     */
    @Transactional // writable: see the note on preview.
    public Batch generate(Long computationId) {
        access.requireRenderer();
        ReportComputation computation = load(computationId);
        if (!ReportComputation.STATUS_APPROVED.equals(computation.getStatus())) {
            throw new IllegalStateException("This computation is not approved yet. "
                    + "Approve it before generating reports for real respondents.");
        }
        ReportTemplate template = requireTemplate(computation);
        ReportDryRunService.EvaluatedCohort cohort = evaluate(computation);

        Map<Long, RespondentAssessmentMapping> byId = new LinkedHashMap<>();
        attempts.findAllForDataStudio(computation.getAssessmentId(),
                        computation.getOrganizationId())
                .forEach(a -> byId.put(a.getRespondentAssessmentMappingId(), a));

        // Recipients first, rendering second. The narrative pass needs the whole
        // cohort in one go — one model call per respondent, run on a small pool
        // — and a render loop that called it per person would serialise every
        // one of them behind the PDF before it.
        Map<Long, Map<String, Object>> valuesByAttempt = new LinkedHashMap<>();
        int skipped = 0;
        for (Map<String, Object> row : cohort.population()) {
            Long attemptId = asLong(row.get("rowId"));
            RespondentAssessmentMapping attempt = attemptId == null ? null : byId.get(attemptId);
            if (attempt == null
                    || attempt.getAssessmentStatus() != RespondentAssessmentStatus.COMPLETED) {
                // Allotted but unfinished. Present in the cohort so the
                // statistics match the dry run, absent from the recipients.
                skipped++;
                continue;
            }
            valuesByAttempt.put(attemptId, cohort.valuesFor(row));
        }
        if (valuesByAttempt.isEmpty()) {
            throw new IllegalStateException("Nobody has completed this assessment yet, "
                    + "so there are no reports to generate.");
        }

        Map<Long, Map<String, String>> narratives =
                narrativeService.resolveForCohort(computation, template, valuesByAttempt);

        List<Report> reports = new ArrayList<>();
        for (Map.Entry<Long, Map<String, Object>> entry : valuesByAttempt.entrySet()) {
            reports.add(render(template, byId.get(entry.getKey()), entry.getValue(),
                    narratives.getOrDefault(entry.getKey(), Map.of())));
        }
        return new Batch(fileName(computation.getSlug() + "-reports-" + LocalDate.now()) + ".zip",
                zip(reports, computation), reports.size(), skipped);
    }

    // ── internals ─────────────────────────────────────────────────────────

    /**
     * Evaluate the pinned rules, and refuse the whole delivery if any failed.
     *
     * <p>Checked here as well as at approval because the two are separated in
     * time: a question can be unplaced from the questionnaire the day after
     * somebody approved, and the column a rule reads stops existing. Approval
     * cannot promise anything about that; this can.
     */
    private ReportDryRunService.EvaluatedCohort evaluate(ReportComputation computation) {
        if (!computation.isDirect()) {
            throw new IllegalStateException("This computation needs a model to produce its "
                    + "values, and no generation engine exists yet.");
        }
        ReportDryRunService.EvaluatedCohort cohort = dryRun.evaluatePinned(
                computation.getAssessmentId(),
                computation.getOrganizationId(),
                computation.getRules().stream()
                        .map(ReportComputationRule::getRuleVersion).toList());
        if (!cohort.isClean()) {
            throw new IllegalStateException("These rules produce no value on this assessment, "
                    + "so no report can be built from them: "
                    + String.join(", ", cohort.failedSlugs().isEmpty()
                            ? cohort.unavailableSlugs() : cohort.failedSlugs()));
        }
        return cohort;
    }

    private Report render(ReportTemplate template, RespondentAssessmentMapping attempt,
            Map<String, Object> ruleValues, Map<String, String> narratives) {

        Map<String, String> resolved =
                values.resolve(template, core.resolve(attempt), ruleValues, narratives);
        byte[] pdf = renderer.toPdf(parser.substitute(template.getHtml(), resolved)).bytes();
        String name = attempt.getRespondent().getName();
        return new Report(attempt.getRespondentAssessmentMappingId(), name,
                fileName(name + "-" + attempt.getRespondentAssessmentMappingId()) + ".pdf",
                pdf, ruleValues);
    }

    private Map<String, Object> rowFor(ReportDryRunService.EvaluatedCohort cohort, Long attemptId) {
        for (Map<String, Object> row : cohort.population()) {
            if (attemptId.equals(asLong(row.get("rowId")))) {
                return cohort.valuesFor(row);
            }
        }
        return null;
    }

    private byte[] zip(List<Report> reports, ReportComputation computation) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            for (Report report : reports) {
                zip.putNextEntry(new ZipEntry(report.fileName()));
                zip.write(report.pdf());
                zip.closeEntry();
            }
            zip.putNextEntry(new ZipEntry("values.json"));
            zip.write(manifest(reports, computation).getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        } catch (IOException e) {
            throw new IllegalStateException("Could not package the reports: " + e.getMessage(), e);
        }
        return out.toByteArray();
    }

    /**
     * What every report in this batch was built from.
     *
     * <p>Records the pinned rule VERSIONS as well as the values, because "score
     * 44" is only evidence if you can also say which formula produced it — and
     * the rule may have been edited into a v5 by the time anybody asks.
     */
    private String manifest(List<Report> reports, ReportComputation computation) {
        StringBuilder sb = new StringBuilder(1024);
        sb.append("{\n  \"computation\": ").append(quote(computation.getSlug()))
                .append(",\n  \"assessmentId\": ").append(computation.getAssessmentId())
                .append(",\n  \"generatedAt\": ").append(quote(LocalDate.now().toString()))
                .append(",\n  \"rules\": [");
        List<ReportComputationRule> rules = computation.getRules();
        for (int i = 0; i < rules.size(); i++) {
            var version = rules.get(i).getRuleVersion();
            if (i > 0) {
                sb.append(',');
            }
            sb.append("\n    {\"slug\": ").append(quote(version.getRule().getSlug()))
                    .append(", \"version\": ").append(version.getVersion())
                    .append(", \"expression\": ").append(quote(version.getExpression()))
                    .append('}');
        }
        sb.append("\n  ],\n  \"respondents\": [");
        for (int i = 0; i < reports.size(); i++) {
            Report report = reports.get(i);
            if (i > 0) {
                sb.append(',');
            }
            sb.append("\n    {\"attemptId\": ").append(report.attemptId())
                    .append(", \"name\": ").append(quote(report.respondentName()))
                    .append(", \"values\": {");
            int n = 0;
            for (Map.Entry<String, Object> e : report.values().entrySet()) {
                if (n++ > 0) {
                    sb.append(", ");
                }
                sb.append(quote(e.getKey())).append(": ")
                        .append(e.getValue() instanceof Number number ? number.toString()
                                : quote(e.getValue() == null ? null : String.valueOf(e.getValue())));
            }
            sb.append("}}");
        }
        return sb.append("\n  ]\n}\n").toString();
    }

    private static String quote(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }

    /**
     * A file name that survives a ZIP and a Windows extractor.
     *
     * <p>Respondent names carry apostrophes, slashes and non-Latin scripts, and
     * a path separator in a ZIP entry name is a directory — or, with enough of
     * them, an escape from the extraction root.
     */
    private static String fileName(String raw) {
        String cleaned = (raw == null ? "report" : raw)
                .replaceAll("[\\\\/:*?\"<>|]", "-")
                .replaceAll("\\s+", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^-|-$", "");
        return cleaned.isBlank() ? "report" : cleaned;
    }

    private static Long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

    private ReportComputation load(Long id) {
        return computations.findByIdWithRules(id)
                .orElseThrow(() -> new NotFoundException("Report computation " + id + " not found"));
    }

    private static ReportTemplate requireTemplate(ReportComputation computation) {
        ReportTemplate template = computation.getTemplate();
        if (template == null) {
            throw new IllegalStateException("This computation has no template, so there is "
                    + "nothing to fill in.");
        }
        return template;
    }
}
