package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Importing a scoring workbook, over HTTP, from the real file.
 *
 * <p>The sheet under {@code report/scoring-logic.csv} is the psychometrician's
 * actual Academic Drive workbook. Driving the import from it rather than from
 * a fixture is what makes these tests worth having: the rows that break an
 * importer are the ones a person wrote - quoted logic full of commas, headings
 * that carry the step, a label with an apostrophe in it - and a sheet invented
 * here would have none of them.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ScoringSheetImportTest {

    @Autowired
    private MockMvc mvc;

    private static final ObjectMapper JSON = new ObjectMapper();

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private static String realSheet() throws Exception {
        try (InputStream in = ScoringSheetImportTest.class
                .getResourceAsStream("/report/scoring-logic.csv")) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** Body for the import endpoints, with the CSV safely JSON-escaped. */
    private static String payload(String csv) throws Exception {
        return "{\"csv\":" + JSON.writeValueAsString(csv) + "}";
    }

    /**
     * Renames every rule so a test can import the same sheet twice without
     * colliding with what an earlier test left behind - rule names are unique
     * across the whole installation, and these tests share one database.
     */
    private static String prefixed(String csv, String tag) {
        return csv.replaceAll("(?m)^(\\d\\.\\d|E\\d),", tag + "-$1,");
    }

    // ── preview ───────────────────────────────────────────────────────────

    @Test
    void anonymousIsRefused() throws Exception {
        mvc.perform(post("/api/report-rules/import/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload("STEP 1 - VALIDITY,,\n1.1,X,y\n")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void previewsTheWholeWorkbookWithoutWritingAnything() throws Exception {
        long before = ruleCount();

        mvc.perform(post("/api/report-rules/import/preview")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(realSheet())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rules.length()").value(22))
                .andExpect(jsonPath("$.blocking").isEmpty());

        org.junit.jupiter.api.Assertions.assertEquals(before, ruleCount(),
                "preview must not create anything");
    }

    /**
     * The wizard's priority question, derived rather than asked for.
     *
     * <p>Steps 4 and 5 each have three rules assigning the same name, so both
     * are choices the practitioner has to make; 4.4 assigns nothing in
     * particular and 2.1 stands alone, so neither is offered as one.
     */
    @Test
    void reportsTheGroupsThatCompeteForOnePlaceholder() throws Exception {
        mvc.perform(post("/api/report-rules/import/preview")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(realSheet())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[?(@.writesTo == 'band')].ruleNames.length()")
                        .value(Matchers.hasItem(3)))
                .andExpect(jsonPath("$.groups[?(@.writesTo == 'profile_note')].ruleNames.length()")
                        .value(Matchers.hasItem(3)));
    }

    // ── import ────────────────────────────────────────────────────────────

    @Test
    void importsEveryRuleAsAStatementFiledUnderItsStep() throws Exception {
        String body = mvc.perform(post("/api/report-rules/import")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(prefixed(realSheet(), "__smoke__a"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(22))
                .andReturn().getResponse().getContentAsString();

        // Nothing runnable was created: an import cannot put a number in a report.
        org.junit.jupiter.api.Assertions.assertFalse(body.contains("\"EXPRESSION\""),
                "import must produce STATEMENT rules only");

        mvc.perform(get("/api/report-rules/getAll").header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == '__smoke__a-4.1 High Drive')].stage")
                        .value(Matchers.hasItem("BAND")))
                .andExpect(jsonPath("$[?(@.name == '__smoke__a-1.1 Infrequency (hard fail)')].stage")
                        .value(Matchers.hasItem("VALIDITY")));
    }

    /**
     * The sheet's own words survive the import.
     *
     * <p>They are what a translation is later checked against, and the only
     * thing left to re-read once a rule becomes a formula.
     */
    @Test
    void keepsTheOriginalSheetTextOnEachRule() throws Exception {
        mvc.perform(post("/api/report-rules/import")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(prefixed(realSheet(), "__smoke__b"))))
                .andExpect(status().isOk())
                // Quoted logic arrives whole, commas and all.
                .andExpect(jsonPath("$[?(@.name == '__smoke__b-4.1 High Drive')]"
                        + ".versions[0].statementText")
                        .value(Matchers.hasItem(Matchers.containsString(
                                "Routing: stretch opportunities, autonomy, leadership roles."))))
                .andExpect(jsonPath("$[?(@.name == '__smoke__b-4.1 High Drive')]"
                        + ".versions[0].notes")
                        .value(Matchers.hasItem(Matchers.containsString("Sets band"))));
    }

    /**
     * All or nothing.
     *
     * <p>Re-importing the same sheet clashes on every name. The refusal has to
     * leave the library exactly as it was - a half-written import is worse than
     * none, because nothing on screen says which half.
     */
    @Test
    void refusesADuplicateImportWithoutWritingAnyOfIt() throws Exception {
        String csv = prefixed(realSheet(), "__smoke__c");

        mvc.perform(post("/api/report-rules/import")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(csv)))
                .andExpect(status().isOk());

        long after = ruleCount();

        mvc.perform(post("/api/report-rules/import")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(csv)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("already exists")));

        org.junit.jupiter.api.Assertions.assertEquals(after, ruleCount(),
                "a refused import must write nothing at all");
    }

    @Test
    void refusesASheetWithNoRules() throws Exception {
        mvc.perform(post("/api/report-rules/import")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload("STEP 1 - VALIDITY CHECKS,,\n\n")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("No rules found")));
    }

    @Test
    void refusesAnEmptyBody() throws Exception {
        mvc.perform(post("/api/report-rules/import")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload("")))
                .andExpect(status().isBadRequest());
    }

    private long ruleCount() throws Exception {
        String body = mvc.perform(get("/api/report-rules/getAll")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JSON.readTree(body).size();
    }
}
