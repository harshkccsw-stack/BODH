package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.bodhpsychometric.model.report.ReportComputation;
import com.bodhpsychometric.model.report.ReportComputationRule;
import com.bodhpsychometric.model.report.ReportComputationTagGuidance;
import com.bodhpsychometric.model.report.ReportNarrative;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.repository.report.ReportNarrativeRepository;
import com.bodhpsychometric.service.report.OpenAiClient;
import com.bodhpsychometric.service.report.ReportNarrativeService;

import tools.jackson.databind.json.JsonMapper;

/**
 * Narrative generation, with the model stubbed.
 *
 * <p>Three properties are worth a test, and none of them is about writing
 * quality — a stub stands in for OpenAI precisely so that what is asserted is
 * the machinery around it:
 *
 * <ol>
 *   <li><b>Identity never leaves.</b> The prompt is built from computed values
 *       only, and a rule that so much as reads {@code core:name} has its value
 *       withheld even though the value itself might look like an ordinary
 *       number. This is the guarantee the whole feature is sold on.</li>
 *   <li><b>Stored prose is reused, but only while it is still true.</b> A
 *       matching fingerprint costs no call; a changed guidance or a changed
 *       score costs one, because the alternative is a paragraph describing a
 *       number that is no longer on the page beside it.</li>
 *   <li><b>A gap is a failure, not a blank.</b> A model that answers with
 *       nothing for a tag must fail the render rather than ship a report with
 *       a hole where a paragraph belongs.</li>
 * </ol>
 *
 * <p>Plain JUnit rather than {@code @SpringBootTest}: the service's collaborators
 * are one HTTP client and one repository, and standing up a context to check
 * what is in a string would hide the assertions in scaffolding.
 */
class ReportNarrativeTest {

    private OpenAiClient openAi;
    private ReportNarrativeRepository narratives;
    private ReportNarrativeService service;

    @BeforeEach
    void setUp() {
        openAi = mock(OpenAiClient.class);
        narratives = mock(ReportNarrativeRepository.class);
        when(openAi.isAvailable()).thenReturn(true);
        when(openAi.model()).thenReturn("stub-model");
        when(narratives.findByComputationReportComputationId(any())).thenReturn(List.of());
        service = new ReportNarrativeService(openAi, narratives,
                JsonMapper.builder().build(), true);
    }

    // ── fixtures ──────────────────────────────────────────────────────────

    private static ReportRuleVersion rule(String slug, String name, String referencedKeysJson) {
        ReportRule r = new ReportRule();
        r.setSlug(slug);
        r.setName(name);
        ReportRuleVersion v = new ReportRuleVersion();
        v.setRule(r);
        v.setReferencedKeysJson(referencedKeysJson);
        return v;
    }

    private static ReportComputation computation(List<ReportRuleVersion> versions,
            Map<String, String> guidance) {
        ReportComputation c = new ReportComputation();
        c.setReportComputationId(7L);
        c.setName("__smoke__narrative");
        int order = 0;
        for (ReportRuleVersion v : versions) {
            ReportComputationRule link = new ReportComputationRule();
            link.setRuleVersion(v);
            link.setComputation(c);
            link.setSortOrder(order++);
            c.getRules().add(link);
        }
        int g = 0;
        for (Map.Entry<String, String> e : guidance.entrySet()) {
            ReportComputationTagGuidance row = new ReportComputationTagGuidance();
            row.setTag(e.getKey());
            row.setGuidance(e.getValue());
            row.setSortOrder(g++);
            row.setComputation(c);
            c.getTagGuidance().add(row);
        }
        return c;
    }

    private static ReportTemplate templateWithNarrative(String... tags) {
        ReportTemplate t = new ReportTemplate();
        List<ReportTagBinding> bindings = new ArrayList<>();
        int order = 0;
        for (String tag : tags) {
            ReportTagBinding b = new ReportTagBinding();
            b.setTag(tag);
            b.setBinderType(ReportTagBinding.TYPE_NARRATIVE);
            b.setSortOrder(order++);
            bindings.add(b);
        }
        // A CORE tag alongside, to prove the narrative pass ignores everything
        // the renderer already answers.
        ReportTagBinding core = new ReportTagBinding();
        core.setTag("respondentName");
        core.setBinderType(ReportTagBinding.TYPE_CORE);
        core.setCoreField("core:name");
        core.setSortOrder(order);
        bindings.add(core);
        t.setBindings(bindings);
        return t;
    }

    /** Capture what was actually sent as the user prompt. */
    private String sentPrompt() {
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(openAi).completeAsJson(anyString(), user.capture());
        return user.getValue();
    }

    // ── 1. identity ───────────────────────────────────────────────────────

    @Test
    void withholdsTheValueOfAnyRuleThatReadsAnIdentityColumn() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\",\"mqt:4\"]"),
                        rule("initials", "Initials", "[\"core:name\"]")),
                Map.of("summary", "Describe the drive score."));

        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"The respondent shows steady drive.\"}");

        service.resolveForCohort(c, templateWithNarrative("summary"),
                Map.of(11L, Map.of("drive", 72, "initials", "Asha Menon")));

        String prompt = sentPrompt();
        assertThat(prompt).contains("drive").contains("72");
        // The rule READS core:name, so neither its slug's value nor the name
        // itself may appear — even though "Asha Menon" is just a string here
        // and nothing about the value alone would have revealed it.
        assertThat(prompt).doesNotContain("Asha Menon");
        assertThat(prompt).doesNotContain("initials");
    }

    @Test
    void neverSendsTheRespondentName() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")),
                Map.of("summary", "Two sentences."));
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"Steady.\"}");

        service.resolveForCohort(c, templateWithNarrative("summary"),
                Map.of(11L, Map.of("drive", 72)));

        // The CORE binding on the template names the respondent, and it is the
        // renderer's job — it must not reach the payload.
        assertThat(sentPrompt()).doesNotContain("core:name").doesNotContain("respondentName");
    }

    @Test
    void refusesWhenNoModelIsConfigured() {
        when(openAi.isAvailable()).thenReturn(false);
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")), Map.of());

        assertThatThrownBy(() -> service.resolveForCohort(c,
                templateWithNarrative("summary"), Map.of(11L, Map.of("drive", 1))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("AI is not configured");
    }

    // ── 2. the cache, and what invalidates it ─────────────────────────────

    @Test
    void reusesStoredProseWhenNothingThatFedItHasChanged() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")),
                Map.of("summary", "Describe the drive score."));
        ReportTemplate t = templateWithNarrative("summary");
        Map<Long, Map<String, Object>> values = Map.of(11L, Map.of("drive", 72));

        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"Written once.\"}");

        // First pass writes and hands the row to the repository.
        service.resolveForCohort(c, t, values);
        ArgumentCaptor<List<ReportNarrative>> saved = ArgumentCaptor.captor();
        verify(narratives).saveAll(saved.capture());
        ReportNarrative row = saved.getValue().get(0);
        assertThat(row.getNarrativeText()).isEqualTo("Written once.");
        assertThat(row.getModel()).isEqualTo("stub-model");

        // Second pass finds it, with the same guidance and the same score.
        row.setRespondentAssessmentMappingId(11L);
        row.setGeneratedAt(LocalDateTime.now());
        when(narratives.findByComputationReportComputationId(7L)).thenReturn(List.of(row));

        Map<Long, Map<String, String>> again = service.resolveForCohort(c, t, values);

        assertThat(again.get(11L)).containsEntry("summary", "Written once.");
        verify(openAi, times(1)).completeAsJson(anyString(), anyString());
    }

    @Test
    void rewritesWhenTheScoreBehindTheProseChanges() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")),
                Map.of("summary", "Describe the drive score."));
        ReportTemplate t = templateWithNarrative("summary");

        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"About a 72.\"}");
        service.resolveForCohort(c, t, Map.of(11L, Map.of("drive", 72)));

        ArgumentCaptor<List<ReportNarrative>> saved = ArgumentCaptor.captor();
        verify(narratives).saveAll(saved.capture());
        ReportNarrative row = saved.getValue().get(0);
        row.setRespondentAssessmentMappingId(11L);
        when(narratives.findByComputationReportComputationId(7L)).thenReturn(List.of(row));

        // Same person, re-scored. The stored paragraph describes the old number,
        // so serving it would contradict the table printed beside it.
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"About a 41.\"}");
        Map<Long, Map<String, String>> out =
                service.resolveForCohort(c, t, Map.of(11L, Map.of("drive", 41)));

        assertThat(out.get(11L)).containsEntry("summary", "About a 41.");
        verify(openAi, times(2)).completeAsJson(anyString(), anyString());
    }

    @Test
    void rewritesWhenTheGuidanceChanges() {
        ReportTemplate t = templateWithNarrative("summary");
        ReportRuleVersion v = rule("drive", "Internal Drive", "[\"mqt:3\"]");
        Map<Long, Map<String, Object>> values = Map.of(11L, Map.of("drive", 72));

        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"Terse.\"}");
        service.resolveForCohort(computation(List.of(v), Map.of("summary", "Be terse.")), t, values);

        ArgumentCaptor<List<ReportNarrative>> saved = ArgumentCaptor.captor();
        verify(narratives).saveAll(saved.capture());
        ReportNarrative row = saved.getValue().get(0);
        row.setRespondentAssessmentMappingId(11L);
        when(narratives.findByComputationReportComputationId(7L)).thenReturn(List.of(row));

        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"At length, then.\"}");
        Map<Long, Map<String, String>> out = service.resolveForCohort(
                computation(List.of(v), Map.of("summary", "Be expansive.")), t, values);

        assertThat(out.get(11L)).containsEntry("summary", "At length, then.");
        verify(openAi, times(2)).completeAsJson(anyString(), anyString());
    }

    // ── 3. a gap is a failure ─────────────────────────────────────────────

    @Test
    void refusesAnAnswerThatLeavesATagEmpty() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")),
                Map.of("summary", "Describe it.", "outlook", "And the outlook."));

        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"Said something.\"}");

        assertThatThrownBy(() -> service.resolveForCohort(c,
                templateWithNarrative("summary", "outlook"), Map.of(11L, Map.of("drive", 72))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("outlook");
        verify(narratives, never()).saveAll(any());
    }

    @Test
    void refusesAnAnswerThatIsNotJson() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")), Map.of());
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("I'm afraid I can't do that.");

        assertThatThrownBy(() -> service.resolveForCohort(c,
                templateWithNarrative("summary"), Map.of(11L, Map.of("drive", 72))))
                .isInstanceOf(IllegalStateException.class);
    }

    // ── shape ─────────────────────────────────────────────────────────────

    @Test
    void flattensProseToOneParagraphSoEscapingCannotLoseIt() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")), Map.of());
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"First line.\\n\\n  Second   line.\"}");

        Map<Long, Map<String, String>> out = service.resolveForCohort(c,
                templateWithNarrative("summary"), Map.of(11L, Map.of("drive", 72)));

        assertThat(out.get(11L).get("summary")).isEqualTo("First line. Second line.");
    }

    @Test
    void narrativeTagsAreOnlyTheNarrativeOnes() {
        assertThat(ReportNarrativeService.narrativeTags(templateWithNarrative("a", "b")))
                .containsExactly("a", "b");
        assertThat(ReportNarrativeService.narrativeTags(null)).isEmpty();
    }

    @Test
    void oneCallCoversEveryTagForARespondent() {
        ReportComputation c = computation(
                List.of(rule("drive", "Internal Drive", "[\"mqt:3\"]")),
                Map.of("summary", "One.", "outlook", "Two."));
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"summary\":\"A.\",\"outlook\":\"B.\"}");

        service.resolveForCohort(c, templateWithNarrative("summary", "outlook"),
                Map.of(11L, Map.of("drive", 72)));

        // Two paragraphs about the same scores have to be written together, or
        // they contradict each other on the page.
        verify(openAi, times(1)).completeAsJson(anyString(), anyString());
    }
}
