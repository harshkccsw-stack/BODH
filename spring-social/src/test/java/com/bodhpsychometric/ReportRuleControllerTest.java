package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The rules library over HTTP.
 *
 * <p>The test database has no assessments, which is not a limitation here — it
 * is the cleanest possible proof of the rule that matters: <b>an EXPRESSION
 * cannot be saved without a real assessment to check its columns against.</b>
 * A hardcoded column list would sail through every one of these.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportRuleControllerTest {

    @Autowired
    private MockMvc mvc;

    private String token() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String auth() throws Exception {
        return "Bearer " + token();
    }

    // ── access ────────────────────────────────────────────────────────────

    @Test
    void anonymousIsRefused() throws Exception {
        mvc.perform(get("/api/report-rules/getAll"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // ── plain-language rules ──────────────────────────────────────────────

    @Test
    void aPlainLanguageRuleIsSavedAsWrittenAndNeedsNoAssessment() throws Exception {
        String body = """
                {"name":"__smoke__ Risk caveat",
                 "definitionKind":"STATEMENT",
                 "statementText":"If any risk item is endorsed, add the safeguarding paragraph.",
                 "resultType":"TEXT"}
                """;
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latestVersion").value(1))
                // "__smoke__ Risk caveat" -> lowercased, non-alphanumerics
                // collapsed to hyphens, edges trimmed. This is the reference a
                // guidance prompt says out loud, so it has to be predictable.
                .andExpect(jsonPath("$.slug").value("smoke-risk-caveat"))
                .andExpect(jsonPath("$.latest.definitionKind").value("STATEMENT"))
                .andExpect(jsonPath("$.latest.statementText").value(
                        "If any risk item is endorsed, add the safeguarding paragraph."));
    }

    @Test
    void aStatementRuleWithNoTextIs400() throws Exception {
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ empty\",\"definitionKind\":\"STATEMENT\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void anUnknownDefinitionKindIs400() throws Exception {
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ k\",\"definitionKind\":\"MAGIC\"}"))
                .andExpect(status().isBadRequest());
    }

    // ── the live-column guarantee ─────────────────────────────────────────

    @Test
    void anExpressionRuleWithoutAnAssessmentIsRefused() throws Exception {
        // The whole point: there is no such thing as a column list in the
        // abstract, so a formula cannot be validated without naming the
        // assessment whose MQ/MQT set it is written against.
        String body = """
                {"name":"__smoke__ floating formula",
                 "definitionKind":"EXPRESSION",
                 "expression":"[mqt:14] + [mqt:15]"}
                """;
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("assessment")));
    }

    @Test
    void anExpressionRuleAgainstAnAssessmentThatDoesNotExistIs404() throws Exception {
        String body = """
                {"name":"__smoke__ ghost assessment",
                 "definitionKind":"EXPRESSION",
                 "expression":"[mqt:14]",
                 "assessmentId":999999}
                """;
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void theColumnPickerIs404ForAnAssessmentThatDoesNotExist() throws Exception {
        // Never an empty list pretending to be a valid column set — that is
        // precisely how a rule ends up valid-looking and wrong.
        mvc.perform(get("/api/report-rules/columns/getByAssessment/999999")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void expressionValidationAnswers200EvenWhenTheFormulaIsBroken() throws Exception {
        // A half-typed formula is a normal state; an error status would make
        // the editor flash red on every keystroke.
        mvc.perform(post("/api/report-rules/validate-expression")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expression\":\"[mqt:1] +\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.errors").isArray());
    }

    @Test
    void validationRejectsAColumnTheAssessmentDoesNotExpose() throws Exception {
        // With no assessment the available set is empty, so every column is
        // unknown — which is the correct answer, not a false pass.
        mvc.perform(post("/api/report-rules/validate-expression")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expression\":\"[mqt:99999]\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false));
    }

    // ── versioning ────────────────────────────────────────────────────────

    @Test
    void savingAnEditWritesANewVersionAndKeepsTheOld() throws Exception {
        String create = """
                {"name":"__smoke__ versioned",
                 "definitionKind":"STATEMENT",
                 "statementText":"First wording."}
                """;
        String created = mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(create))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Long id = Long.valueOf(created.replaceAll(".*\"reportRuleId\"\\s*:\\s*(\\d+).*", "$1"));

        String edit = """
                {"name":"__smoke__ versioned",
                 "definitionKind":"STATEMENT",
                 "statementText":"Second wording."}
                """;
        mvc.perform(put("/api/report-rules/update/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(edit))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latestVersion").value(2))
                .andExpect(jsonPath("$.latest.statementText").value("Second wording."))
                // The point of versioning: v1 is still readable, so a report
                // approved against it stays explicable.
                .andExpect(jsonPath("$.versions[0].statementText").value("First wording."))
                .andExpect(jsonPath("$.versions.length()").value(2));
    }

    @Test
    void aDuplicateNameIs409() throws Exception {
        String body = """
                {"name":"__smoke__ dup rule",
                 "definitionKind":"STATEMENT","statementText":"x"}
                """;
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aBlankNameIs400() throws Exception {
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"definitionKind\":\"STATEMENT\",\"statementText\":\"x\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void gettingARuleThatDoesNotExistIs404() throws Exception {
        mvc.perform(get("/api/report-rules/getById/999999")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isNotFound());
    }
}
