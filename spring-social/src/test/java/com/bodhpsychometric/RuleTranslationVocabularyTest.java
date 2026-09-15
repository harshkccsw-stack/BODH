package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.service.report.OpenAiClient;

import tools.jackson.databind.ObjectMapper;

/**
 * What the model is TOLD, which is the half of a translation nobody reads.
 *
 * <p>The catalog names every other rule so that one rule's text can refer to
 * another's output by the workbook's own name for it. That vocabulary used to
 * be read from each rule's latest version — and translating a rule replaces its
 * statement with a formula, leaving the new version's statement null.
 *
 * <p>So a rule went anonymous the moment it became a formula. In the workbook
 * that broke the one link that mattered: 3.4 wrote {@code AD_composite} in v1,
 * became a formula in v3, and 4.1's {@code IF AD_composite >= 48} was then
 * translated against a catalog where nothing was called AD_composite. The model
 * reached for a raw column whose label said "total" and banded the wrong trait.
 *
 * <p>These tests read the prompt itself, because that is where the defect was.
 * A test of the answer would have passed throughout — the model is stubbed.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RuleTranslationVocabularyTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @MockitoBean
    private OpenAiClient openAi;

    private static final String TAG = "__smoke__voc";

    private Long assessmentId;

    /** Unique per test: names are unique across the library. */
    private final String run = TAG + "-" + Long.toString(System.nanoTime(), 36);

    @BeforeEach
    void modelIsConfigured() {
        when(openAi.isAvailable()).thenReturn(true);
        when(openAi.model()).thenReturn("stub-model");
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"translations\":[]}");
    }

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private long statementRule(String name, String text) throws Exception {
        String body = mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "name", name,
                                "definitionKind", "STATEMENT",
                                "statementText", text,
                                "stage", "SCORE"))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("reportRuleId").asLong();
    }

    /** Translate it: the statement is replaced by a formula, as accepting does. */
    private void becomesAFormula(long ruleId, String name, String expression) throws Exception {
        mvc.perform(put("/api/report-rules/update/" + ruleId)
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "name", name,
                                "definitionKind", "EXPRESSION",
                                "expression", expression,
                                "assessmentId", assessment(),
                                "stage", "SCORE"))))
                .andDo(r -> {
                    if (r.getResponse().getStatus() != 200) {
                        throw new AssertionError("update -> " + r.getResponse().getStatus()
                                + " : " + r.getResponse().getContentAsString());
                    }
                });
    }

    /**
     * A questionnaire and an assessment with nothing placed.
     *
     * <p>Enough, and deliberately no more: these tests are about the words in
     * the prompt, and the formulae they save are constants. No item needs to
     * exist for a rule to be given a home, and the save path insists on one
     * because a formula is checked against an assessment's columns.
     */
    private long assessment() throws Exception {
        if (assessmentId != null) {
            return assessmentId;
        }
        String qnr = mvc.perform(post("/api/questionnaire/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "name", run + " QNR", "hasSections", false))))
                .andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString();
        long questionnaireId = json.readTree(qnr).path("questionnaireId").asLong();

        String body = mvc.perform(post("/api/assessments/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "name", run + " assessment",
                                "questionnaireId", questionnaireId,
                                "showTermsAndConditions", false,
                                "status", "ACTIVE",
                                "autoNext", false))))
                .andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString();
        assessmentId = json.readTree(body).path("assessmentId").asLong();
        return assessmentId;
    }

    private String slugOf(long ruleId) throws Exception {
        String body = mvc.perform(get("/api/report-rules/getById/" + ruleId)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("slug").asString("");
    }

    /** The prompt actually sent, captured from the stub. */
    private String promptFor(long ruleId) throws Exception {
        mvc.perform(post("/api/report-rules/ai/translate")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessment() + ",\"ruleIds\":[" + ruleId + "]}"))
                .andExpect(status().isOk());
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(openAi).completeAsJson(anyString(), user.capture());
        return user.getValue();
    }

    /**
     * The regression, end to end: a translated rule keeps the name other rules
     * call it by.
     */
    @Test
    void aTranslatedRuleKeepsItsWorkbookName() throws Exception {
        long composite = statementRule(TAG + " 3.4 Composite",
                "AD_composite = ID_score + ST_score + AE_score. Range 12-60.");
        String slug = slugOf(composite);
        becomesAFormula(composite, TAG + " 3.4 Composite", "1 + 1");

        long band = statementRule(TAG + " 4.1 High Drive",
                "IF AD_composite >= 48 THEN band = 'High Drive'.");
        String prompt = promptFor(band);

        assertTrue(prompt.contains("[rule:" + slug + "]"),
                () -> "the composite should be offered as a reference:\n" + prompt);
        assertTrue(prompt.contains("writes: AD_composite"),
                () -> "the name 4.1 refers to was lost when 3.4 became a formula:\n" + prompt);
    }

    /**
     * And what it DOES, not only what it is called.
     *
     * <p>The token match is fragile on its own: the sheet says
     * {@code AD_composite} in one place and "Academic Composite" in another, and
     * a rule renamed by a later edit has no token at all. The description is
     * what lets the model match on meaning.
     */
    @Test
    void theCatalogSaysWhatEachRuleComputes() throws Exception {
        long composite = statementRule(TAG + " composite says",
                "Sum of total score of Internal drive + Sustained Tenacity + Adaptive Execution");
        becomesAFormula(composite, TAG + " composite says", "1 + 1");

        String prompt = promptFor(statementRule(TAG + " reader", "Band the composite."));
        assertTrue(prompt.contains("says: Sum of total score of Internal drive"),
                () -> "a translated rule should still describe itself:\n" + prompt);
    }

    /**
     * A later edit can restate a rule in prose that assigns to nothing. The
     * newest STATEMENT then yields no name, while the name every other rule
     * still uses sits in an earlier version — so the two are walked separately.
     */
    @Test
    void findsTheNameEvenWhenALaterVersionStatesNone() throws Exception {
        long composite = statementRule(TAG + " renamed",
                "AD_composite = ID_score + ST_score + AE_score.");
        // v2: prose, no assignment. v3: a formula.
        mvc.perform(put("/api/report-rules/update/" + composite)
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "name", TAG + " renamed",
                                "definitionKind", "STATEMENT",
                                "statementText", "Sum of the three factor totals",
                                "stage", "SCORE"))))
                .andExpect(status().isOk());
        becomesAFormula(composite, TAG + " renamed", "1 + 1");

        String prompt = promptFor(statementRule(TAG + " renamed reader", "Band it."));
        assertTrue(prompt.contains("writes: AD_composite"),
                () -> "the still-current name lives in an older version:\n" + prompt);
        assertTrue(prompt.contains("says: Sum of the three factor totals"),
                () -> "the newest description should win:\n" + prompt);
    }

    /**
     * An already-translated rule is not a translation target at all.
     *
     * <p>Worth pinning because {@code sourceText} now walks back for a
     * statement, and a reader could reasonably assume that was fixing
     * re-translation. It was not: {@code propose} only ever targets rules whose
     * latest version is NOT a formula, so a translated rule is filtered out
     * before any prompt is built. The walk-back matters for the CATALOG, where
     * translated rules very much do appear.
     */
    @Test
    void refusesToRetranslateAFormula() throws Exception {
        long rule = statementRule(TAG + " retranslate",
                "IF the drive score is at least 15 THEN band = 'High'.");
        becomesAFormula(rule, TAG + " retranslate", "1 + 1");

        mvc.perform(post("/api/report-rules/ai/translate")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessment()
                                + ",\"ruleIds\":[" + rule + "]}"))
                .andExpect(status().isConflict());
    }

    /** The instruction that tells the model to prefer a rule over a column. */
    @Test
    void tellsTheModelToReferenceRulesRatherThanRebuildThem() throws Exception {
        String prompt = promptFor(statementRule(TAG + " instruction", "Band the composite."));
        assertTrue(prompt.contains("says:") || prompt.contains("writes:")
                        || prompt.contains("RULES you may reference"),
                () -> "the rules vocabulary should be present:\n" + prompt);
    }
}
