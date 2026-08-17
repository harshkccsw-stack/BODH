package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * Questionnaire and section instructions are authored with the dashboard's
 * rich-text editor and rendered into respondents' browsers as HTML, on
 * endpoints that carry no authentication — so the same allowlist that guards
 * an assessment's consent text guards these two fields.
 *
 * <p>The other half of the contract is backwards compatibility: every
 * instruction written before the editor existed is plain prose, and re-saving
 * it must behave exactly as it did. Nothing here rewrites stored text.
 */
@SpringBootTest
@AutoConfigureMockMvc
class InstructionMarkupTest {

    @Autowired
    private MockMvc mvc;

    private static final String EDITOR_MARKUP =
            "<p><b>Read carefully.</b> Answer <i>every</i> item.</p>"
                    + "<ul><li>No time limit</li><li>One sitting</li></ul>";

    private int createQuestionnaire(String generalInstruction) throws Exception {
        String body = mvc.perform(post("/api/questionnaire/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(questionnaireJson("Markup QNR " + generalInstruction.hashCode(),
                                generalInstruction)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.questionnaireId");
    }

    /** A create/update body whose generalInstruction is already JSON-quoted. */
    private String questionnaireJson(String name, String generalInstruction) {
        return "{\"name\":\"" + name + "\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                + "\"description\":null,\"durationMinutes\":null,"
                + "\"generalInstruction\":" + generalInstruction + ",\"hasSections\":true}";
    }

    /** Raw text as a JSON string literal — newlines included, since legacy prose has them. */
    private static String json(String raw) {
        return "\"" + raw.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    @Test
    void storesTheMarkupTheEditorProduces() throws Exception {
        int id = createQuestionnaire(json(EDITOR_MARKUP));
        mvc.perform(get("/api/questionnaire/getById/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generalInstruction").value(EDITOR_MARKUP));

        String sectionBody = mvc.perform(post("/api/questionnaire/" + id + "/sections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Markup Part A\",\"instruction\":" + json(EDITOR_MARKUP) + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.instruction").value(EDITOR_MARKUP))
                .andReturn().getResponse().getContentAsString();

        int sectionId = JsonPath.read(sectionBody, "$.sectionId");
        mvc.perform(put("/api/questionnaire/" + id + "/sections/" + sectionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Markup Part A\",\"instruction\":"
                                + json("<h3>Part A</h3><ol><li>first</li></ol>") + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instruction").value("<h3>Part A</h3><ol><li>first</li></ol>"));
    }

    /**
     * The whole point of the allowlist. Note the field name in the message:
     * the author needs to know WHICH box they broke, which is why the shared
     * validator takes the field name rather than hardcoding one.
     */
    @Test
    void rejectsMarkupOutsideTheAllowlist() throws Exception {
        mvc.perform(post("/api/questionnaire/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(questionnaireJson("Markup Script QNR",
                                json("<p>hi</p><script>alert(1)</script>"))))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("generalInstruction")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("<script>")));

        int id = createQuestionnaire(json("<p>fine</p>"));

        mvc.perform(put("/api/questionnaire/update/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(questionnaireJson("Markup QNR renamed",
                                json("<img src=x onerror=alert(1)>"))))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("<img>")));
        // The rejected update wrote nothing — not the instruction, not the name.
        mvc.perform(get("/api/questionnaire/getById/" + id))
                .andExpect(jsonPath("$.generalInstruction").value("<p>fine</p>"));

        mvc.perform(post("/api/questionnaire/" + id + "/sections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Markup Part B\",\"instruction\":"
                                + json("<a href=\"javascript:alert(1)\">click</a>") + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("instruction")));

        String sectionBody = mvc.perform(post("/api/questionnaire/" + id + "/sections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Markup Part C\",\"instruction\":null}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        int sectionId = JsonPath.read(sectionBody, "$.sectionId");
        mvc.perform(put("/api/questionnaire/" + id + "/sections/" + sectionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Markup Part C\",\"instruction\":"
                                + json("<p style=\"position:fixed\">gotcha</p>") + "}"))
                .andExpect(status().isBadRequest());
    }

    /**
     * Instructions authored before the editor existed are plain prose with
     * real newlines. They must still save, and must come back byte-for-byte —
     * the clients escape them at render time, so the API never rewrites them.
     */
    @Test
    void keepsPlainTextInstructionsExactlyAsTheyWere() throws Exception {
        String legacy = "Answer honestly.\nThere are no right or wrong answers.\n\nAsk if unsure.";
        int id = createQuestionnaire(json(legacy));
        mvc.perform(get("/api/questionnaire/getById/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generalInstruction").value(legacy));

        mvc.perform(post("/api/questionnaire/" + id + "/sections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Legacy Part A\",\"instruction\":" + json(legacy) + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.instruction").value(legacy));
    }

    /**
     * An author who empties the editor leaves "<p><br></p>" behind. Stored as
     * written it is blank on screen but truthy to every "has an instruction?"
     * check — the portal would open an empty Instructions gate.
     */
    @Test
    void storesAnEmptiedEditorAsNull() throws Exception {
        int id = createQuestionnaire(json("<p><br></p>"));
        mvc.perform(get("/api/questionnaire/getById/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generalInstruction").value(org.hamcrest.Matchers.nullValue()));

        mvc.perform(post("/api/questionnaire/" + id + "/sections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Blank Part A\",\"instruction\":" + json("<p>&nbsp;</p>") + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.instruction").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void rejectsBodiesOverTheCap() throws Exception {
        mvc.perform(post("/api/questionnaire/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(questionnaireJson("Markup Huge QNR", json("x".repeat(20_001)))))
                .andExpect(status().isBadRequest());

        int id = createQuestionnaire(json("<p>fine</p>"));
        mvc.perform(post("/api/questionnaire/" + id + "/sections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Huge Part A\",\"instruction\":" + json("x".repeat(5_001)) + "}"))
                .andExpect(status().isBadRequest());
    }
}
