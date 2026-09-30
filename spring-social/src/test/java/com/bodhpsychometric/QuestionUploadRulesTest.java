package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The server's half of the question upload's rules.
 *
 * <ul>
 *   <li>A multiple-choice question needs at least one option — every placed
 *       question is mandatory, so one with nothing to pick stops every
 *       respondent at it.
 *   <li>A refused batch names EVERY refused question, by payload position,
 *       so the upload can point at each sheet row instead of one per retry.
 *   <li>/find-existing says which stems the bank already holds, ignoring a
 *       leading item number, and writes nothing.
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionUploadRulesTest {

    @Autowired
    private MockMvc mvc;

    private static String question(String stem, String... options) {
        StringBuilder opts = new StringBuilder();
        for (String o : options) {
            if (opts.length() > 0) {
                opts.append(',');
            }
            opts.append("{\"optionText\":\"").append(o)
                    .append("\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}");
        }
        return "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,"
                + "\"riskFlag\":false,\"options\":[" + opts + "],\"mqtScores\":[]}";
    }

    @Test
    void aMultipleChoiceQuestionWithNoOptionsIsRefused_andOneOptionIsEnough() throws Exception {
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(question("Upload Rules nothing to pick")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("a multiple-choice question needs at least one option"));

        // Blank option rows are sanitized away before the count, exactly as
        // the write would drop them — they cannot sneak a question past.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(question("Upload Rules blank rows only", "", "  ")))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(question("Upload Rules consent", "I understand")))
                .andExpect(status().isCreated());
    }

    @Test
    void aRefusedBatchListsEveryProblemByPosition() throws Exception {
        String batch = "[" + question("Upload Rules fine one", "Yes", "No") + ","
                + question("Upload Rules no options") + ","
                + question("Upload Rules fine two", "Yes") + ","
                + question("Upload Rules also none") + "]";

        mvc.perform(post("/api/questions/bulk-create").contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "question 2: a multiple-choice question needs at least one option (and 1 more)"))
                .andExpect(jsonPath("$.problems.length()").value(2))
                .andExpect(jsonPath("$.problems[0].index").value(1))
                .andExpect(jsonPath("$.problems[1].index").value(3))
                .andExpect(jsonPath("$.problems[1].message").value(
                        "a multiple-choice question needs at least one option"));

        // All or nothing: the two good questions were not written either.
        mvc.perform(post("/api/questions/find-existing").contentType(MediaType.APPLICATION_JSON)
                        .content("[\"Upload Rules fine one\",\"Upload Rules fine two\"]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void theImportEndpointListsEveryProblemToo() throws Exception {
        String body = "{\"newQualities\":[],\"newQualityTypes\":[],\"questions\":["
                + question("Upload Rules import none") + ","
                + question("Upload Rules import fine", "Yes") + ","
                + question("Upload Rules import none again") + "]}";

        mvc.perform(post("/api/questions/import").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems.length()").value(2))
                .andExpect(jsonPath("$.problems[0].index").value(0))
                .andExpect(jsonPath("$.problems[1].index").value(2));
    }

    @Test
    void findExistingMatchesTheBankIgnoringALeadingItemNumber() throws Exception {
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(question("Upload Rules I enjoy chatting with others.", "Mostly", "Never")))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/questions/find-existing").contentType(MediaType.APPLICATION_JSON)
                        .content("[\"Upload Rules something new\","
                                + "\"Upload Rules I enjoy chatting with others.\","
                                + "\"1. upload rules i enjoy chatting with others\","
                                + "\"(2) Upload Rules I enjoy chatting, with others!\"]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].index").value(1))
                .andExpect(jsonPath("$[0].method").value("EXACT"))
                .andExpect(jsonPath("$[1].index").value(2))
                .andExpect(jsonPath("$[1].method").value("NORMALISED"))
                .andExpect(jsonPath("$[2].index").value(3));
    }
}
