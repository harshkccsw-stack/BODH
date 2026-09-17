package com.bodhpsychometric;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.service.report.OpenAiClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * AI translation, with the model stubbed.
 *
 * <p>The point of these tests is NOT that the model is clever - it is that the
 * model's cleverness is irrelevant. A stub stands in for OpenAI and is made to
 * return the things a real model actually gets wrong: an invented function, a
 * column that does not exist, a formula for the wrong rule, prose instead of
 * JSON. Each one has to be caught by the gates rather than reaching the
 * reviewer as a plausible-looking suggestion.
 *
 * <p>Stubbing also keeps the suite free: no key, no network, no cost, and the
 * tests behave the same on a machine that has never been configured.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RuleTranslationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    /** Stands in for OpenAI. Every test decides what "the model" answers. */
    @MockitoBean
    private OpenAiClient openAi;

    private static final String TAG = "__smoke__tr";

    @BeforeEach
    void modelIsConfigured() {
        when(openAi.isAvailable()).thenReturn(true);
        when(openAi.model()).thenReturn("stub-model");
    }

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    /** A plain-language rule, as an import would have created it. */
    private long statementRule(String name, String text) throws Exception {
        String body = mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of(
                                "name", name,
                                "definitionKind", "STATEMENT",
                                "statementText", text,
                                "stage", "PROFILE"))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("reportRuleId").asLong();
    }

    private String slugOf(long ruleId) throws Exception {
        String body = mvc.perform(get("/api/report-rules/getById/" + ruleId)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("slug").asString("");
    }

    /** What the stubbed model will answer. */
    private void modelSays(String slug, String expression, boolean confident, String note) {
        when(openAi.completeAsJson(anyString(), anyString())).thenReturn(
                "{\"translations\":[{\"slug\":\"" + slug + "\",\"expression\":\"" + expression
                        + "\",\"confident\":" + confident + ",\"note\":\"" + note + "\"}]}");
    }

    private JsonNode translate(long ruleId) throws Exception {
        String body = mvc.perform(post("/api/report-rules/ai/translate")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":1,\"ruleIds\":[" + ruleId + "]}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("proposals").path(0);
    }

    // ── availability ──────────────────────────────────────────────────────

    @Test
    void anonymousIsRefused() throws Exception {
        mvc.perform(post("/api/report-rules/ai/translate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":1,\"ruleIds\":[1]}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reportsWhetherTranslationIsConfigured() throws Exception {
        when(openAi.isAvailable()).thenReturn(false);
        mvc.perform(get("/api/report-rules/ai/available")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false));
    }

    /** The message has to name the file to edit, not just say "not configured". */
    @Test
    void refusesWithAnActionableMessageWhenThereIsNoKey() throws Exception {
        long id = statementRule(TAG + " no key", "High drive and low execution.");
        when(openAi.isAvailable()).thenReturn(false);
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenThrow(new IllegalStateException(
                        "AI translation is not configured. Set OPENAI_API_KEY in secrets.env "
                                + "and restart the server."));

        mvc.perform(post("/api/report-rules/ai/translate")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":1,\"ruleIds\":[" + id + "]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("secrets.env")));
    }

    // ── the gates ─────────────────────────────────────────────────────────

    /**
     * The formula here references nothing, which is a property of this test
     * database rather than of the feature: it holds no assessments, so no
     * column and no [rule:...] reference can be resolved and every such
     * formula is answered "choose an assessment first". That refusal is the
     * right one - a formula checked against columns nobody has is a formula
     * valid everywhere and correct nowhere - so the plumbing is proven with a
     * reference-free formula and the resolving path is verified live instead.
     */
    @Test
    void acceptsAFormulaThatValidates() throws Exception {
        long target = statementRule(TAG + " believes not acts", "High belief, low execution.");
        modelSays(slugOf(target), "IF(1 > 0, 'High belief, low execution.', '')",
                true, "Straightforward.");

        JsonNode p = translate(target);
        org.junit.jupiter.api.Assertions.assertTrue(p.path("ok").asBoolean(),
                () -> "errors: " + p.path("errors"));
        org.junit.jupiter.api.Assertions.assertTrue(p.path("confident").asBoolean());
        org.junit.jupiter.api.Assertions.assertEquals("string", p.path("resultType").asString(""));
    }

    /**
     * The single most likely model mistake, and the cheapest to catch.
     *
     * <p>The grammar's function whitelist is enforced at PARSE time, so an
     * invented name never reaches evaluation, let alone a report.
     */
    @Test
    void rejectsAnInventedFunction() throws Exception {
        long id = statementRule(TAG + " invented function", "Join the two labels together.");
        modelSays(slugOf(id), "CONCAT('a', 'b')", true, "");

        JsonNode p = translate(id);
        org.junit.jupiter.api.Assertions.assertFalse(p.path("ok").asBoolean());
        org.junit.jupiter.api.Assertions.assertTrue(
                p.path("errors").toString().contains("CONCAT"),
                () -> "expected the parser to name the function: " + p.path("errors"));
    }

    /** A plausible-looking column that this assessment does not expose. */
    @Test
    void rejectsAColumnThatDoesNotExist() throws Exception {
        long id = statementRule(TAG + " invented column", "Use the drive score.");
        modelSays(slugOf(id), "[mqt:9999] + 1", true, "");

        JsonNode p = translate(id);
        org.junit.jupiter.api.Assertions.assertFalse(p.path("ok").asBoolean());
        org.junit.jupiter.api.Assertions.assertTrue(
                p.path("errors").toString().contains("mqt:9999"),
                () -> String.valueOf(p.path("errors")));
    }

    /** A rule that reads itself has no defined value, and saving refuses it too. */
    @Test
    void rejectsASelfReference() throws Exception {
        long id = statementRule(TAG + " self reference", "Whatever this rule says.");
        modelSays(slugOf(id), "[rule:" + slugOf(id) + "] + 1", true, "");

        JsonNode p = translate(id);
        org.junit.jupiter.api.Assertions.assertFalse(p.path("ok").asBoolean());
    }

    /**
     * The degrade path, which matters more than any success case.
     *
     * <p>Told it cannot map something, the model must return nothing and say
     * why. The rule stays a STATEMENT and the note reaches the reviewer -
     * visible-and-unrunnable being strictly better than runnable-and-wrong.
     */
    @Test
    void surfacesTheModelsRefusalInsteadOfAGuess() throws Exception {
        long id = statementRule(TAG + " speed check",
                "IF total completion time < 45 seconds THEN protocol_status = 'INVALID'.");
        modelSays(slugOf(id), "", false, "No completion-time column exists in this assessment.");

        JsonNode p = translate(id);
        org.junit.jupiter.api.Assertions.assertFalse(p.path("ok").asBoolean());
        org.junit.jupiter.api.Assertions.assertFalse(p.path("confident").asBoolean());
        org.junit.jupiter.api.Assertions.assertTrue(
                p.path("note").asString("").contains("completion-time"));
        // The source text travels with it, so the reviewer can see what was asked.
        org.junit.jupiter.api.Assertions.assertTrue(
                p.path("sourceText").asString("").contains("45 seconds"));
    }

    /** A model that answers with prose must not look like a failed translation. */
    @Test
    void refusesAnAnswerThatIsNotJson() throws Exception {
        long id = statementRule(TAG + " not json", "Anything.");
        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("Certainly! Here is the formula you asked for.");

        mvc.perform(post("/api/report-rules/ai/translate")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":1,\"ruleIds\":[" + id + "]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("JSON")));
    }

    /** An answer about some other rule leaves this one untranslated, not wrong. */
    @Test
    void ignoresAnAnswerForARuleThatWasNotAsked() throws Exception {
        long id = statementRule(TAG + " unanswered", "Something.");
        modelSays("a-slug-that-is-not-this-rule", "1 + 1", true, "");

        JsonNode p = translate(id);
        org.junit.jupiter.api.Assertions.assertFalse(p.path("ok").asBoolean());
        org.junit.jupiter.api.Assertions.assertTrue(p.path("expression").isNull()
                || p.path("expression").asString("").isBlank());
    }

    /**
     * The retry earns its place: a rejected formula is sent back with the
     * validator's exact complaint, and a model that corrects itself produces a
     * usable proposal without the reviewer touching anything.
     */
    @Test
    void retriesOnceWithTheValidatorsComplaint() throws Exception {
        long target = statementRule(TAG + " retry target", "High when the score is high.");
        String good = "IF(1 > 0, 'high', '')";

        when(openAi.completeAsJson(anyString(), anyString()))
                .thenReturn("{\"translations\":[{\"slug\":\"" + slugOf(target)
                        + "\",\"expression\":\"NOSUCHFUNC(1)\",\"confident\":true,\"note\":\"\"}]}")
                .thenReturn("{\"translations\":[{\"slug\":\"" + slugOf(target)
                        + "\",\"expression\":\"" + good + "\",\"confident\":true,\"note\":\"fixed\"}]}");

        JsonNode p = translate(target);
        org.junit.jupiter.api.Assertions.assertTrue(p.path("ok").asBoolean(),
                () -> "the retry should have produced a valid formula: " + p.path("errors"));
    }

    /**
     * Nothing is saved by translating. The rule is still plain language until a
     * human accepts the proposal through the ordinary save path.
     */
    @Test
    void savesNothing() throws Exception {
        long id = statementRule(TAG + " unsaved", "Something true.");
        modelSays(slugOf(id), "IF(1 > 0, 'yes', '')", true, "");
        translate(id);

        mvc.perform(get("/api/report-rules/getById/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.versions.length()").value(1))
                .andExpect(jsonPath("$.versions[0].definitionKind").value("STATEMENT"));
    }
}
