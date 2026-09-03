package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.model.report.ReportComputation;
import com.bodhpsychometric.model.report.ReportComputationRule;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.service.report.ReportColumnCatalog;
import com.bodhpsychometric.service.report.ReportPromptAssembler;

/**
 * What the model would be sent — assembled, never dispatched.
 *
 * <p>The assertions that matter here are the negative ones: no identity column
 * reaches the prompt, and the safety contract the sandbox depends on is stated
 * in it. Those are leadership requirements, not stylistic preferences.
 */
class ReportPromptAssemblerTest {

    /** Stub catalog — the real one needs a live assessment. */
    private static ReportPromptAssembler assemblerWith(List<ReportColumnCatalog.ReportColumn> cols) {
        ReportColumnCatalog catalog = new ReportColumnCatalog(null) {
            @Override
            public List<ReportColumnCatalog.ReportColumn> columnsFor(Long a, Long o) {
                return cols;
            }
        };
        return new ReportPromptAssembler(catalog);
    }

    private static List<ReportColumnCatalog.ReportColumn> sampleColumns() {
        return List.of(
                new ReportColumnCatalog.ReportColumn("core:name", "Respondent", "string", "core"),
                new ReportColumnCatalog.ReportColumn("core:email", "Email", "string", "core"),
                new ReportColumnCatalog.ReportColumn("core:respondentId", "Respondent id", "number", "core"),
                new ReportColumnCatalog.ReportColumn("core:serialId", "Serial ID", "string", "core"),
                new ReportColumnCatalog.ReportColumn("core:completed", "Completed (1/0)", "number", "core"),
                new ReportColumnCatalog.ReportColumn("demo:3", "Age band", "string", "demographics"),
                new ReportColumnCatalog.ReportColumn("mqt:14", "Big Five / Extraversion", "number", "scores"),
                new ReportColumnCatalog.ReportColumn("mqt:15", "Big Five / Sociability", "number", "scores"));
    }

    private static ReportRuleVersion expressionRule(String slug, String name, String expr,
            String keysJson, boolean population) {
        ReportRule rule = new ReportRule();
        rule.setReportRuleId(1L);
        rule.setName(name);
        rule.setSlug(slug);

        ReportRuleVersion v = new ReportRuleVersion();
        v.setVersion(2);
        v.setDefinitionKind(ReportRuleVersion.KIND_EXPRESSION);
        v.setExpression(expr);
        v.setResultType(ReportRuleVersion.RESULT_NUMBER);
        v.setReferencedKeysJson(keysJson);
        v.setPopulation(population);
        v.setRule(rule);
        return v;
    }

    private static ReportComputation computationWith(ReportRuleVersion... versions) {
        ReportComputation c = new ReportComputation();
        c.setReportComputationId(7L);
        c.setName("Counselling scoring");
        c.setAssessmentId(42L);
        c.setSourcePrompt("Fill the summary from the Extraversion composite.");

        ReportTemplate template = new ReportTemplate();
        template.setName("Counselling report");
        template.setVersion(1);
        ReportTagBinding tag = new ReportTagBinding();
        tag.setTag("overall_summary");
        template.addBinding(tag);
        c.setTemplate(template);

        int order = 0;
        for (ReportRuleVersion v : versions) {
            ReportComputationRule link = new ReportComputationRule();
            link.setRuleVersion(v);
            link.setSortOrder(order++);
            c.addRule(link);
        }
        return c;
    }

    // ── the requirement: identity never leaves ────────────────────────────

    @Test
    void noIdentityColumnEverReachesThePrompt() {
        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("extraversion", "Extraversion composite",
                        "([mqt:14]+[mqt:15])/2", "[\"mqt:14\",\"mqt:15\"]", false)),
                List.of());

        assertThat(prompt.prompt())
                .as("the model needs the shape of the distribution, never whose it is")
                .doesNotContain("core:name")
                .doesNotContain("core:email")
                .doesNotContain("core:serialId")
                .doesNotContain("core:respondentId");

        // A non-identity core column is still fine and useful.
        assertThat(prompt.prompt()).contains("core:completed");
    }

    @Test
    void theSafetyContractTheSandboxDependsOnIsStated() {
        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false)),
                List.of());
        String text = prompt.prompt();

        assertThat(text).contains("No database access");
        assertThat(text).contains("No file access, no network, no subprocess, no eval, no exec");
        assertThat(text).contains("Deterministic");
        assertThat(text).contains("compute_report_values");
        // Cohort-wide, not per respondent — a 500-report batch must not be 500
        // sandbox round-trips.
        assertThat(text).contains("respondents: list[dict]");
        assertThat(text).contains("referenced_keys");
    }

    @Test
    void theRuleTextIsSentUnparaphrased() {
        String expr = "ROUND(([mqt:14]+[mqt:15])/2*20, 1)";
        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("extraversion", "Extraversion composite",
                        expr, "[\"mqt:14\",\"mqt:15\"]", false)),
                List.of());
        assertThat(prompt.prompt()).contains(expr);
        assertThat(prompt.prompt()).contains("Extraversion composite");
        assertThat(prompt.prompt()).contains("extraversion");
    }

    @Test
    void aPlainLanguageRuleIsCarriedThroughAsWritten() {
        ReportRule rule = new ReportRule();
        rule.setName("Risk caveat");
        rule.setSlug("risk-caveat");
        ReportRuleVersion v = new ReportRuleVersion();
        v.setVersion(1);
        v.setDefinitionKind(ReportRuleVersion.KIND_STATEMENT);
        v.setStatementText("If any risk item is endorsed, add the safeguarding paragraph.");
        v.setResultType(ReportRuleVersion.RESULT_TEXT);
        v.setReferencedKeysJson("[]");
        v.setRule(rule);

        var prompt = assemblerWith(sampleColumns()).assemble(computationWith(v), List.of());
        assertThat(prompt.prompt())
                .contains("If any risk item is endorsed, add the safeguarding paragraph.");
    }

    @Test
    void declaredKeysAreExactlyWhatTheRulesRead() {
        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false)),
                List.of());
        // This is the set the sandbox is restricted to — §4.3 of the build plan.
        assertThat(prompt.declaredKeys()).containsExactly("mqt:14");
        assertThat(prompt.prompt()).contains("the sandbox will be given ONLY these");
    }

    // ── the requirement: a rule cannot be used where its columns are absent ──

    @Test
    void aRuleReadingAColumnThisAssessmentLacksBlocksTheWholeThing() {
        // Exactly the failure a hardcoded column list would have allowed:
        // valid-looking rule, wrong assessment, every respondent scores null.
        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("ghost", "Ghost rule",
                        "[mqt:999]", "[\"mqt:999\"]", false)),
                List.of());

        assertThat(prompt.isReady()).isFalse();
        assertThat(prompt.blockers())
                .anyMatch(b -> b.contains("mqt:999") && b.contains("does not have"));
    }

    @Test
    void aCompleteDraftIsReady() {
        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false)),
                List.of());
        assertThat(prompt.blockers()).isEmpty();
        assertThat(prompt.isReady()).isTrue();
        assertThat(prompt.expectedTags()).containsExactly("overall_summary");
    }

    @Test
    void missingPiecesAreNamedInTheAuthorsLanguage() {
        ReportComputation bare = new ReportComputation();
        bare.setName("Empty");
        bare.setAssessmentId(42L);

        var prompt = assemblerWith(sampleColumns()).assemble(bare, List.of());
        assertThat(prompt.isReady()).isFalse();
        assertThat(prompt.blockers()).hasSize(3);
        assertThat(String.join(" ", prompt.blockers()))
                .contains("template")
                .contains("rule")
                .contains("guidance prompt");
    }

    @Test
    void aPopulationRuleIsFlaggedAsMovingWithTheCohort() {
        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("z", "Z", "ZSCORE([mqt:14])",
                        "[\"mqt:14\"]", true)),
                List.of());
        assertThat(String.join(" ", prompt.warnings())).contains("cohort");
        assertThat(prompt.prompt()).contains("compares the respondent to the whole cohort");
    }

    @Test
    void anAssessmentWithNoColumnsCannotProduceAPrompt() {
        var prompt = assemblerWith(List.of()).assemble(
                computationWith(expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false)),
                List.of());
        assertThat(prompt.isReady()).isFalse();
        assertThat(String.join(" ", prompt.blockers())).contains("no columns");
    }

    @Test
    void perTagGuidanceReachesThePrompt() {
        var guidance = new com.bodhpsychometric.model.report.ReportComputationTagGuidance();
        guidance.setTag("overall_summary");
        guidance.setGuidance("Two sentences, plain English, no jargon.");

        var prompt = assemblerWith(sampleColumns()).assemble(
                computationWith(expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false)),
                List.of(guidance));

        assertThat(prompt.prompt()).contains("Two sentences, plain English, no jargon.");
    }

    @Test
    void theGuidancePromptIsCarriedVerbatim() {
        var c = computationWith(expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false));
        c.setSourcePrompt("Use rule X for ${a}; if MQ/MQT > 1.2 use the 'high' variant.");
        var prompt = assemblerWith(sampleColumns()).assemble(c, List.of());
        assertThat(prompt.prompt())
                .contains("Use rule X for ${a}; if MQ/MQT > 1.2 use the 'high' variant.");
    }
}
