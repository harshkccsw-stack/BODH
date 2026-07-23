package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * Placement report tags through the public endpoints: the questions PUT is
 * the only writer of placements, so it must stamp "Q_n" on flat
 * questionnaires and "Section_X_Q_n" on sectioned ones, and re-stamp on
 * every re-save. Read back through getByQuestionnaireId, whose global
 * ordering (sortOrder, then id) interleaves sections — tags must NOT.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionnaireQuestionTagTest {

    @Autowired
    private MockMvc mvc;

    private int createQuestion(String stem) throws Exception {
        String body = mvc.perform(post("/api/questions/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,"
                                + "\"riskFlag\":false,\"options\":["
                                + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.questionId");
    }

    private int createQuestionnaire(String name, boolean hasSections) throws Exception {
        String body = mvc.perform(post("/api/questionnaire/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"shortName\":null,\"category\":null,"
                                + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                                + "\"generalInstruction\":null,\"hasSections\":" + hasSections + "}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.questionnaireId");
    }

    private int createSection(int questionnaireId, String name) throws Exception {
        String body = mvc.perform(post("/api/questionnaire/" + questionnaireId + "/sections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"instruction\":null}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.sectionId");
    }

    /** stem → questionTag as the dashboard reads it back. */
    private Map<String, String> tagsByStem(int questionnaireId) throws Exception {
        String body = mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> questions = JsonPath.read(body, "$");
        Map<String, String> tags = new HashMap<>();
        for (Map<String, Object> q : questions) {
            tags.put((String) q.get("stem"), (String) q.get("questionTag"));
        }
        return tags;
    }

    @Test
    void flatQuestionnaireTagsFollowSortOrderNotPayloadOrder() throws Exception {
        int q1 = createQuestion("Tag flat first");
        int q2 = createQuestion("Tag flat second");
        int q3 = createQuestion("Tag flat third");
        int questionnaireId = createQuestionnaire("Tag Flat QNR", false);

        // Payload deliberately out of order — sortOrder decides the number.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + q3 + ",\"sectionId\":null,\"sortOrder\":2},"
                                + "{\"questionId\":" + q1 + ",\"sectionId\":null,\"sortOrder\":0},"
                                + "{\"questionId\":" + q2 + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        Map<String, String> tags = tagsByStem(questionnaireId);
        assertThat(tags).containsEntry("Tag flat first", "Q_1")
                .containsEntry("Tag flat second", "Q_2")
                .containsEntry("Tag flat third", "Q_3");
    }

    @Test
    void sectionedQuestionnaireTagsCountPerSectionAndRegenerateOnResave() throws Exception {
        int qa1 = createQuestion("Tag sec A one");
        int qa2 = createQuestion("Tag sec A two");
        int qb1 = createQuestion("Tag sec B one");
        int questionnaireId = createQuestionnaire("Tag Sectioned QNR", true);
        int sectionA = createSection(questionnaireId, "Verbal");
        int sectionB = createSection(questionnaireId, "Numerical");

        // Per-section sortOrders start at 0 — exactly what the wizard sends.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + qa1 + ",\"sectionId\":" + sectionA + ",\"sortOrder\":0},"
                                + "{\"questionId\":" + qa2 + ",\"sectionId\":" + sectionA + ",\"sortOrder\":1},"
                                + "{\"questionId\":" + qb1 + ",\"sectionId\":" + sectionB + ",\"sortOrder\":0}]"))
                .andExpect(status().isOk());

        Map<String, String> tags = tagsByStem(questionnaireId);
        assertThat(tags).containsEntry("Tag sec A one", "Section_A_Q_1")
                .containsEntry("Tag sec A two", "Section_A_Q_2")
                .containsEntry("Tag sec B one", "Section_B_Q_1");

        // Re-save moving B's question first within B and swapping A's order —
        // tags must mirror the NEW layout, nothing stale survives.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + qa2 + ",\"sectionId\":" + sectionA + ",\"sortOrder\":0},"
                                + "{\"questionId\":" + qa1 + ",\"sectionId\":" + sectionA + ",\"sortOrder\":1},"
                                + "{\"questionId\":" + qb1 + ",\"sectionId\":" + sectionB + ",\"sortOrder\":0}]"))
                .andExpect(status().isOk());

        tags = tagsByStem(questionnaireId);
        assertThat(tags).containsEntry("Tag sec A two", "Section_A_Q_1")
                .containsEntry("Tag sec A one", "Section_A_Q_2")
                .containsEntry("Tag sec B one", "Section_B_Q_1");
    }
}
