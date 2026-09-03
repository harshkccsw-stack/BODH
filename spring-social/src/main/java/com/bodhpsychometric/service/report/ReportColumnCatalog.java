package com.bodhpsychometric.service.report;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.service.datastudio.DataStudioDatasetService;

/**
 * The MQ/MQT (and demographic, and answer) columns a rule may reference, <b>for
 * one specific assessment, read live</b>.
 *
 * <h2>Why this is not a cached or hardcoded list</h2>
 *
 * Different assessments expose different MQ/MQT sets: the score columns come
 * from {@code MqtScoringService.planFor(questionnaireId)}, which is derived from
 * the questions actually PLACED in that questionnaire. Unplace a question and
 * the MQTs it scored can disappear from the assessment entirely.
 *
 * <p>So a static list — or a list cached at rule-authoring time — would let
 * somebody build a rule that <b>looks valid and breaks the moment it is used on
 * the wrong assessment</b>: the column resolves to nothing, every respondent
 * scores null, and the report is confidently wrong rather than obviously
 * broken. That failure is invisible in a single PDF, which is exactly the class
 * of bug this whole design is arranged to make impossible.
 *
 * <p>Everything therefore goes through
 * {@link DataStudioDatasetService#columnKeys(Long, Long)} and its underlying
 * {@code dataset()} — the same source Data Studio validates its own formulas
 * against, so a formula means the same thing in a report as it does in a sheet.
 *
 * <p><b>Cost, stated honestly:</b> {@code columnKeys()} builds the whole dataset
 * (rows included) to return its column list, and this reuses that. It is the
 * existing behaviour rather than a regression, and correctness beats a cache
 * whose staleness is silent — but if the picker ever feels slow on a large
 * cohort, a columns-only path in {@code DataStudioDatasetService} is the fix,
 * not a cache here.
 */
@Service
public class ReportColumnCatalog {

    /**
     * A column offered to the rule author.
     *
     * @param key   the identifier a formula uses, e.g. {@code mqt:14}
     * @param label the human name, e.g. the MQT's full path. <b>MQT names are
     *              deliberately not unique</b> in this product, so the label is
     *              a path and the key is the only safe identity.
     * @param type  number / string / enum
     * @param group core | demographics | answers | scores
     */
    public record ReportColumn(String key, String label, String type, String group) {
    }

    private final DataStudioDatasetService datasets;

    public ReportColumnCatalog(DataStudioDatasetService datasets) {
        this.datasets = datasets;
    }

    /**
     * Every column this assessment actually exposes right now, in the order
     * Data Studio presents them (core, demographics, answers, scores).
     *
     * <p>An assessment that does not exist returns an EMPTY list rather than
     * throwing: the caller turns that into a 404 with a message, and the rules
     * page shows "this assessment has no scoreable columns" instead of a stack
     * trace.
     */
    @Transactional(readOnly = true)
    public List<ReportColumn> columnsFor(Long assessmentId, Long organizationId) {
        return datasets.dataset(assessmentId, organizationId)
                .map(DsDatasetResponse::columns)
                .orElseGet(List::of)
                .stream()
                .map(c -> new ReportColumn(c.key(), c.label(), c.type(), c.group()))
                .toList();
    }

    /** Just the keys — what expression validation is checked against. */
    @Transactional(readOnly = true)
    public Set<String> columnKeys(Long assessmentId, Long organizationId) {
        return datasets.columnKeys(assessmentId, organizationId);
    }

    /** True when the assessment exists at all. Distinguishes 404 from "empty". */
    @Transactional(readOnly = true)
    public boolean assessmentExists(Long assessmentId) {
        return datasets.dataset(assessmentId, null).isPresent();
    }

    /**
     * The keys that must never reach a model or a sandbox: the identity columns.
     *
     * <p>Spec §5.2 permits a sample of real rows at design time so band cuts can
     * be chosen against a real distribution, but the model needs the SHAPE of
     * the distribution and never whose it is. These are stripped from every
     * sample and excluded from the schema the prompt describes.
     */
    public static final Set<String> IDENTITY_KEYS = Set.of(
            "core:name",
            "core:email",
            "core:serialId",
            "core:respondentId");

    public static boolean isIdentityColumn(String key) {
        return IDENTITY_KEYS.contains(key);
    }
}
