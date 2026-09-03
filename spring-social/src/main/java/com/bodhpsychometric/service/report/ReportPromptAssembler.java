package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.bodhpsychometric.model.report.ReportComputation;
import com.bodhpsychometric.model.report.ReportComputationRule;
import com.bodhpsychometric.model.report.ReportComputationTagGuidance;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;

/**
 * Builds the meta-prompt — everything the model would be sent — <b>and stops
 * there</b>.
 *
 * <p>No provider has been chosen, so nothing in this class makes a network
 * call, and the backend still has no outbound HTTP anywhere. What it produces
 * is text a human can read, review and paste, which is deliberately the most
 * useful artifact at this stage: the prompt is the thing that has to be right
 * before the choice of model matters at all.
 *
 * <h2>What goes in, per spec §5</h2>
 *
 * <ol>
 *   <li>The full text of every selected rule, <b>unparaphrased</b>.</li>
 *   <li>The psychometrician's guidance prompt, verbatim.</li>
 *   <li>The exact {@code ${tag}} list parsed from the template, with each tag's
 *       expected type and its per-tag guidance.</li>
 *   <li>The respondent data <b>schema</b> — key, label, type — for the live
 *       per-assessment column list.</li>
 *   <li>The fixed function signature and output contract, as a hard
 *       requirement.</li>
 *   <li>The safety rules the generated code must obey.</li>
 * </ol>
 *
 * <h2>What deliberately does not go in</h2>
 *
 * <p><b>No identity columns, ever.</b> {@code core:name}, {@code core:email},
 * {@code core:serialId} and {@code core:respondentId} are stripped from the
 * schema and would be stripped from any sample rows. Spec §5.2 allows a capped
 * sample of real rows at design time so band cuts can be chosen against a real
 * distribution — the model needs the SHAPE of the distribution and never whose
 * it is.
 *
 * <p><b>No rows at all yet.</b> Sample rows are a P4 addition, gated on a
 * provider being chosen and on the development database actually having data.
 * The schema alone is enough to write correct code against; rows only improve
 * band cuts.
 */
@Service
public class ReportPromptAssembler {

    private final ReportColumnCatalog columns;

    public ReportPromptAssembler(ReportColumnCatalog columns) {
        this.columns = columns;
    }

    /**
     * @param prompt        the assembled text, ready to send
     * @param declaredKeys  the column keys the generated function may read —
     *                      this is what the sandbox will be restricted to
     * @param expectedTags  every tag the function must return a value for
     * @param blockers      why this cannot be sent yet; empty means ready
     * @param warnings      things worth knowing that do not block
     */
    public record AssembledPrompt(
            String prompt,
            List<String> declaredKeys,
            List<String> expectedTags,
            List<String> blockers,
            List<String> warnings) {

        public boolean isReady() {
            return blockers.isEmpty();
        }
    }

    public AssembledPrompt assemble(ReportComputation computation,
            List<ReportComputationTagGuidance> guidance) {

        List<String> blockers = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        ReportTemplate template = computation.getTemplate();
        if (template == null) {
            blockers.add("Choose the report template whose placeholders this must fill.");
        }
        if (computation.getRules().isEmpty()) {
            blockers.add("Select at least one rule from the library.");
        }
        if (computation.getSourcePrompt() == null || computation.getSourcePrompt().isBlank()) {
            blockers.add("Write the guidance prompt describing what the report should say.");
        }

        List<ReportColumnCatalog.ReportColumn> available =
                columns.columnsFor(computation.getAssessmentId(), computation.getOrganizationId());
        if (available.isEmpty()) {
            blockers.add("This assessment exposes no columns — nothing has been placed in its "
                    + "questionnaire yet, so there is nothing for a rule to read.");
        }

        // Columns the model may describe and the sandbox may be handed: the
        // live per-assessment list, minus identity.
        List<ReportColumnCatalog.ReportColumn> safeColumns = available.stream()
                .filter(c -> !ReportColumnCatalog.isIdentityColumn(c.key()))
                .toList();

        List<ReportRuleVersion> ruleVersions = computation.getRules().stream()
                .sorted(java.util.Comparator.comparingInt(ReportComputationRule::getSortOrder))
                .map(ReportComputationRule::getRuleVersion)
                .toList();

        // Every column every selected rule reads. This is the set the sandbox
        // is restricted to in P3/P4 — see §4.3 of the build plan.
        Set<String> declared = ruleVersions.stream()
                .flatMap(v -> ReportRuleService.parseKeys(v.getReferencedKeysJson()).stream())
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));

        Set<String> availableKeys = available.stream()
                .map(ReportColumnCatalog.ReportColumn::key)
                .collect(Collectors.toSet());
        List<String> missing = declared.stream().filter(k -> !availableKeys.contains(k)).toList();
        if (!missing.isEmpty()) {
            blockers.add("These rules read columns this assessment does not have: "
                    + String.join(", ", missing)
                    + ". The rule was written against a different assessment.");
        }

        List<String> tags = template == null ? List.of()
                : template.getBindings().stream()
                        .map(ReportTagBinding::getTag)
                        .toList();
        if (template != null && tags.isEmpty()) {
            warnings.add("The chosen template has no placeholders, so the generated code would "
                    + "have nothing to return.");
        }

        boolean anyPopulation = ruleVersions.stream().anyMatch(ReportRuleVersion::isPopulation);
        if (anyPopulation) {
            warnings.add("At least one rule compares respondents to the cohort, so its answers "
                    + "move as more people complete. The cohort size gate applies.");
        }

        Map<String, String> guidanceByTag = new LinkedHashMap<>();
        for (ReportComputationTagGuidance g : guidance) {
            guidanceByTag.put(g.getTag(), g.getGuidance());
        }

        String prompt = render(computation, template, ruleVersions, safeColumns, tags,
                guidanceByTag, declared);

        return new AssembledPrompt(prompt, List.copyOf(declared), tags, blockers, warnings);
    }

    private String render(ReportComputation c,
            ReportTemplate template,
            List<ReportRuleVersion> ruleVersions,
            List<ReportColumnCatalog.ReportColumn> safeColumns,
            List<String> tags,
            Map<String, String> guidanceByTag,
            Set<String> declared) {

        StringBuilder p = new StringBuilder(8192);

        p.append("""
                You are generating a Python function for a psychometric report engine.

                Read every section below. The CONTRACT and SAFETY RULES are hard \
                requirements: output that violates them is rejected automatically and \
                never reaches a respondent.

                """);

        // ── 1. task ───────────────────────────────────────────────────────
        p.append("## 1. What this computation is for\n\n");
        p.append("Name: ").append(c.getName()).append('\n');
        if (c.getDescription() != null && !c.getDescription().isBlank()) {
            p.append("Description: ").append(c.getDescription()).append('\n');
        }
        p.append("Assessment id: ").append(c.getAssessmentId()).append('\n');
        if (template != null) {
            p.append("Report template: ").append(template.getName())
                    .append(" (v").append(template.getVersion()).append(")\n");
        }
        p.append('\n');

        // ── 2. the psychometrician's own words ────────────────────────────
        p.append("## 2. Guidance from the psychometrician (verbatim)\n\n");
        p.append(c.getSourcePrompt() == null ? "(none supplied)" : c.getSourcePrompt().strip());
        p.append("\n\n");

        // ── 3. the rules, unparaphrased ───────────────────────────────────
        p.append("## 3. Rules to implement\n\n");
        if (ruleVersions.isEmpty()) {
            p.append("(none selected)\n");
        }
        for (ReportRuleVersion v : ruleVersions) {
            p.append("### ").append(v.getRule().getName())
                    .append("  [reference: ").append(v.getRule().getSlug())
                    .append(", version ").append(v.getVersion()).append("]\n");
            if (v.getRule().getDescription() != null && !v.getRule().getDescription().isBlank()) {
                p.append(v.getRule().getDescription()).append('\n');
            }
            p.append("Kind: ").append(v.getDefinitionKind())
                    .append("   Result type: ").append(v.getResultType()).append('\n');
            if (v.isPopulation()) {
                p.append("NOTE: this rule compares the respondent to the whole cohort.\n");
            }
            p.append("Definition:\n");
            if (v.isExpression()) {
                p.append("```\n").append(v.getExpression()).append("\n```\n");
                p.append("Columns it reads: ")
                        .append(String.join(", ", ReportRuleService.parseKeys(v.getReferencedKeysJson())))
                        .append('\n');
            } else {
                p.append(v.getStatementText().strip()).append('\n');
            }
            if (v.getNotes() != null && !v.getNotes().isBlank()) {
                p.append("Author's notes: ").append(v.getNotes().strip()).append('\n');
            }
            p.append('\n');
        }

        // ── 4. what must come back ────────────────────────────────────────
        p.append("## 4. Values the report needs\n\n");
        p.append("Return a value for EVERY key below. Missing keys are rejected.\n\n");
        if (tags.isEmpty()) {
            p.append("(the template has no placeholders)\n");
        }
        for (String tag : tags) {
            p.append("- `").append(tag).append('`');
            String g = guidanceByTag.get(tag);
            if (g != null && !g.isBlank()) {
                p.append(" — ").append(g.strip());
            }
            p.append('\n');
        }
        p.append('\n');

        // ── 5. the data shape ─────────────────────────────────────────────
        p.append("""
                ## 5. Respondent data available

                Each respondent is a dict keyed by the column identifiers below. \
                Values may be None — a respondent can skip a question, and a score \
                for an unanswered item does not exist. Handle None everywhere; a \
                crash on one respondent fails the whole batch.

                Identity fields (name, email, ids) are deliberately NOT included and \
                never will be. Do not reference them.

                """);
        String currentGroup = null;
        for (ReportColumnCatalog.ReportColumn col : safeColumns) {
            if (!col.group().equals(currentGroup)) {
                currentGroup = col.group();
                p.append("\n### ").append(currentGroup).append('\n');
            }
            p.append("- `").append(col.key()).append("` (").append(col.type()).append(") — ")
                    .append(col.label()).append('\n');
        }
        p.append('\n');

        if (!declared.isEmpty()) {
            p.append("""
                    The selected rules read only these columns, and the sandbox will be \
                    given ONLY these:

                    """);
            for (String key : declared) {
                p.append("- `").append(key).append("`\n");
            }
            p.append("\nIf you need a column that is not in this list, say so explicitly "
                    + "instead of using it.\n\n");
        }

        // ── 6. the contract ───────────────────────────────────────────────
        p.append("""
                ## 6. Required function contract

                Produce exactly one self-contained Python function with this signature:

                ```python
                def compute_report_values(respondents: list[dict],
                                          reference_data: dict | None = None) -> dict[str, dict]:
                    \"""
                    respondents:    one dict per respondent, keyed as in section 5.
                                    Each carries 'respondent_key' identifying the row.
                    reference_data: lookup/norm tables, or None. Never hardcode a norm
                                    table into the function body — read it from here.
                    Returns:        {respondent_key: {template_key: value}} covering every
                                    respondent given and every key from section 4.
                    \"""
                ```

                It takes the WHOLE COHORT, not one respondent, for two reasons: a batch \
                of 500 reports must not be 500 sandbox round-trips, and any rule that \
                compares a respondent to the cohort needs the cohort in scope.

                Alongside the code, return a declaration:

                ```json
                {
                  "output_keys":     ["...every key from section 4..."],
                  "referenced_keys": ["...every column the code reads..."],
                  "is_population":   true,
                  "notes":           "anything you could not implement, or had to assume"
                }
                ```

                `referenced_keys` is checked against the live column list before the code \
                is ever run, and the sandbox is then handed ONLY those columns — reading \
                anything you did not declare raises immediately rather than silently \
                returning None for everybody.

                ## 7. Safety rules

                - Standard library only. No imports beyond: math, statistics, json, re,
                  decimal, itertools, collections.
                - No file access, no network, no subprocess, no eval, no exec.
                - No database access of any kind. The function receives its data as
                  arguments and has no other way to obtain any.
                - Deterministic. Do NOT use random, datetime.now, time, uuid, os.environ
                  or id(). The same input must always produce the same output — that is
                  what makes the result safe to reuse.
                - Return a real function, not a formula string, and not a description of
                  one.
                """);

        return p.toString();
    }
}
