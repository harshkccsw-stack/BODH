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
        return assemblerWith(cols, List.of());
    }

    /** As above, plus the rule slugs the library is pretending to hold. */
    private static ReportPromptAssembler assemblerWith(
            List<ReportColumnCatalog.ReportColumn> cols, List<String> librarySlugs) {
        ReportColumnCatalog catalog = new ReportColumnCatalog(null) {
            @Override
            public List<ReportColumnCatalog.ReportColumn> columnsFor(Long a, Long o) {
                return cols;
            }
        };
        com.bodhpsychometric.service.report.ReportRuleCatalog ruleCatalog =
                new com.bodhpsychometric.service.report.ReportRuleCatalog(null) {
                    @Override
                    public List<String> allSlugs() {
                        return librarySlugs;
                    }
                };
        return new ReportPromptAssembler(catalog, ruleCatalog);
    }

    /** A computation whose guidance names exactly the rules it selected. */
    private static ReportComputation computationSaying(String guidance, ReportRuleVersion... vs) {
        ReportComputation c = computationWith(vs);
        c.setSourcePrompt(guidance);
        return c;
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
        // COMPUTED, not the default UNBOUND: only a tag whose template says a
        // computation fills it is asked for. An unanswered tag is unfinished
        // template work, not a request.
        tag.setBinderType(ReportTagBinding.TYPE_COMPUTED);
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

    // ── the requirement: only computed tags are asked for ─────────────────

    @Test
    void tagsTheTemplateAnswersItselfAreNeverAskedFor() {
        // The bug this closes: the prompt asked for ${respondent_name} while
        // section 5 said identity is excluded and must never be referenced —
        // one prompt, two contradictory instructions, and an invitation to
        // invent a name.
        ReportComputation c = computationWith(
                expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false));

        ReportTagBinding core = new ReportTagBinding();
        core.setTag("respondent_name");
        core.setBinderType(ReportTagBinding.TYPE_CORE);
        core.setCoreField("core:name");
        c.getTemplate().addBinding(core);

        ReportTagBinding literal = new ReportTagBinding();
        literal.setTag("disclaimer");
        literal.setBinderType(ReportTagBinding.TYPE_LITERAL);
        literal.setLiteralText("Not a clinical diagnosis.");
        c.getTemplate().addBinding(literal);

        var prompt = assemblerWith(sampleColumns()).assemble(c, List.of());

        assertThat(prompt.expectedTags()).containsExactly("overall_summary");
        assertThat(prompt.prompt())
                .doesNotContain("respondent_name")
                .doesNotContain("disclaimer");
        assertThat(prompt.prompt())
                .as("the model is told they exist and are handled, so it does not return them")
                .contains("2 further placeholders the report engine fills itself");
        assertThat(prompt.blockers()).isEmpty();
    }

    @Test
    void aTemplateWithNothingMarkedComputedCannotProduceAPrompt() {
        // "Return a value for EVERY key below" under an empty list is an
        // instruction a model satisfies by inventing keys, so this blocks.
        ReportComputation c = computationWith(
                expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false));
        c.getTemplate().getBindings().get(0).setBinderType(ReportTagBinding.TYPE_LITERAL);
        c.getTemplate().getBindings().get(0).setLiteralText("Fixed.");

        var prompt = assemblerWith(sampleColumns()).assemble(c, List.of());

        assertThat(prompt.isReady()).isFalse();
        assertThat(String.join(" ", prompt.blockers()))
                .contains("No placeholder on this template is marked as filled by a computation");
    }

    @Test
    void anUnansweredTagIsNotRequestedButIsPointedOut() {
        ReportComputation c = computationWith(
                expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false));
        ReportTagBinding open = new ReportTagBinding();
        open.setTag("forgotten");
        c.getTemplate().addBinding(open);

        var prompt = assemblerWith(sampleColumns()).assemble(c, List.of());

        assertThat(prompt.expectedTags()).containsExactly("overall_summary");
        assertThat(prompt.prompt()).doesNotContain("forgotten");
        assertThat(String.join(" ", prompt.warnings()))
                .contains("1 placeholder")
                .contains("not been answered at all");
        assertThat(prompt.blockers())
                .as("one unanswered tag does not block a computation that has real work")
                .isEmpty();
    }

    @Test
    void guidanceForATagThatIsNotComputedIsReportedAsUnsent() {
        var stray = new com.bodhpsychometric.model.report.ReportComputationTagGuidance();
        stray.setTag("disclaimer");
        stray.setGuidance("Should read gently.");

        ReportComputation c = computationWith(
                expressionRule("e", "E", "[mqt:14]", "[\"mqt:14\"]", false));
        ReportTagBinding literal = new ReportTagBinding();
        literal.setTag("disclaimer");
        literal.setBinderType(ReportTagBinding.TYPE_LITERAL);
        literal.setLiteralText("Not a clinical diagnosis.");
        c.getTemplate().addBinding(literal);

        var prompt = assemblerWith(sampleColumns()).assemble(c, List.of(stray));

        assertThat(String.join(" ", prompt.warnings()))
                .contains("disclaimer")
                .contains("is not sent");
        assertThat(prompt.prompt()).doesNotContain("Should read gently");
    }

    // ── the requirement: the prompt's rule references must resolve ─────────

    @Test
    void aRuleNamedInTheGuidanceButNotSelectedIsReported() {
        // The failure this catches: the sentence reads perfectly, and the rule
        // it names is simply absent from section 3 — the model is asked to
        // apply logic it was never given.
        var prompt = assemblerWith(sampleColumns(), List.of("extraversion", "anxiety-composite"))
                .assemble(computationSaying(
                        "Use `extraversion`, then band with `anxiety-composite`.",
                        expressionRule("extraversion", "Extraversion composite",
                                "[mqt:14]", "[\"mqt:14\"]", false)),
                        List.of());

        assertThat(String.join(" ", prompt.warnings()))
                .contains("anxiety-composite")
                .contains("not selected here");
        assertThat(prompt.blockers())
                .as("a dangling reference is worth saying out loud, not worth blocking on")
                .isEmpty();
    }

    @Test
    void awordThatIsNotARuleSlugIsNeverReported() {
        // The reason the lint reads the whole library instead of guessing: a
        // warning that fires on ordinary prose is one people learn to ignore.
        var prompt = assemblerWith(sampleColumns(), List.of("extraversion"))
                .assemble(computationSaying(
                        "Print `low`, `average` or `high` from `extraversion`, in plain English.",
                        expressionRule("extraversion", "Extraversion composite",
                                "[mqt:14]", "[\"mqt:14\"]", false)),
                        List.of());

        assertThat(String.join(" ", prompt.warnings()))
                .doesNotContain("low")
                .doesNotContain("average")
                .doesNotContain("high");
    }

    @Test
    void aLongerSlugContainingAShorterOneIsNotAReferenceToTheShorterOne() {
        // '-' is a word boundary to \b, so a naive match finds the rule
        // `extraversion` inside a mention of `extraversion-composite` and warns
        // about a rule nobody named.
        var prompt = assemblerWith(sampleColumns(), List.of("extraversion", "extraversion-composite"))
                .assemble(computationSaying(
                        "Use `extraversion-composite` throughout.",
                        expressionRule("extraversion-composite", "Extraversion composite",
                                "[mqt:14]", "[\"mqt:14\"]", false)),
                        List.of());

        assertThat(prompt.warnings()).isEmpty();
    }

    @Test
    void aRuleWhoseSlugIsAWordInsideAnotherRulesNameIsNotAReference() {
        // The false positive that made backticks load-bearing: `extraversion`
        // is a real library rule, and it is also the first word of the SELECTED
        // rule's name. Matching bare words would accuse the author of naming a
        // rule they never mentioned — in the very sentence where they named the
        // right one correctly.
        var prompt = assemblerWith(sampleColumns(),
                List.of("extraversion", "extraversion-composite"))
                .assemble(computationSaying(
                        "Fill the summary from the Extraversion composite.",
                        expressionRule("extraversion-composite", "Extraversion composite",
                                "[mqt:14]", "[\"mqt:14\"]", false)),
                        List.of());

        assertThat(prompt.warnings()).isEmpty();
    }

    @Test
    void aBareSlugInProseIsDeliberatelyNotTreatedAsAReference() {
        // The miss that precision costs, and it is the cheap side of the trade:
        // no warning rather than a wrong one. The insert rail writes backticks,
        // so the common path is covered.
        var prompt = assemblerWith(sampleColumns(), List.of("anxiety-composite"))
                .assemble(computationSaying(
                        "Summarise using `extraversion`; unlike anxiety-composite this is "
                                + "not a clinical scale.",
                        expressionRule("extraversion", "Extraversion composite",
                                "[mqt:14]", "[\"mqt:14\"]", false)),
                        List.of());

        assertThat(prompt.warnings()).isEmpty();
    }

    @Test
    void aSelectedRuleTheGuidanceNeverMentionsIsPointedOut() {
        var prompt = assemblerWith(sampleColumns(), List.of("extraversion", "facet-ranking"))
                .assemble(computationSaying(
                        "Summarise from `extraversion`.",
                        expressionRule("extraversion", "Extraversion composite",
                                "[mqt:14]", "[\"mqt:14\"]", false),
                        expressionRule("facet-ranking", "Facet ranking",
                                "[mqt:15]", "[\"mqt:15\"]", false)),
                        List.of());

        assertThat(String.join(" ", prompt.warnings()))
                .contains("Facet ranking")
                .contains("never refers to it");
    }

    @Test
    void referringToARuleByItsNameCountsAsReferringToIt() {
        // An author who writes "the Extraversion composite" has named the rule
        // as plainly as its slug does; being told otherwise is simply wrong.
        var prompt = assemblerWith(sampleColumns(), List.of("extraversion"))
                .assemble(computationSaying(
                        "Fill the summary from the Extraversion composite.",
                        expressionRule("extraversion", "Extraversion composite",
                                "[mqt:14]", "[\"mqt:14\"]", false)),
                        List.of());

        assertThat(prompt.warnings()).isEmpty();
    }
}
