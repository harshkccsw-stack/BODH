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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * Deleting a selection of bank questions in one call.
 *
 * <p>All-or-nothing, like the other bulk writes: the interesting case is a
 * selection with one question that cannot go, which must leave the other
 * two exactly where they were.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionBulkDeleteTest {

    @Autowired
    private MockMvc mvc;

    private long question(String stem) throws Exception {
        String body = "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"riskFlag\":false,"
                + "\"options\":[{\"optionText\":\"a\",\"contentType\":\"TEXT\",\"mqtScores\":[]},"
                + "{\"optionText\":\"b\",\"contentType\":\"TEXT\",\"mqtScores\":[]}],\"mqtScores\":[]}";
        String created = mvc.perform(post("/api/questions/create")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(created, "$.questionId")).longValue();
    }

    private void expectFound(long id, boolean present) throws Exception {
        mvc.perform(get("/api/questions/getById/" + id))
                .andExpect(present ? status().isOk() : status().isNotFound());
    }

    @Test
    void deletesEveryQuestionInTheSelection() throws Exception {
        long a = question("bulk delete a");
        long b = question("bulk delete b");

        mvc.perform(post("/api/questions/bulk-delete").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"questionIds\":[" + a + "," + b + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(2));

        expectFound(a, false);
        expectFound(b, false);
    }

    @Test
    void oneQuestionInAQuestionnaireStopsTheWholeCall() throws Exception {
        long free = question("bulk delete free");
        long placed = question("bulk delete placed");

        String qn = mvc.perform(post("/api/questionnaire/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"bulk delete holder\",\"vertical\":\"CLINICAL\",\"hasSections\":false}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long questionnaireId = ((Number) JsonPath.read(qn, "$.questionnaireId")).longValue();
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + placed + ",\"sectionId\":null,\"sortOrder\":0}]"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/questions/bulk-delete").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"questionIds\":[" + free + "," + placed + "]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.blocked[0].questionId").value(placed));

        // Nothing was deleted — including the one that could have been.
        expectFound(free, true);
        expectFound(placed, true);
    }

    @Test
    void anIdThatIsAlreadyGoneIsNamedRatherThanIgnored() throws Exception {
        long a = question("bulk delete survivor");

        mvc.perform(post("/api/questions/bulk-delete").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"questionIds\":[" + a + ",987654321]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.blocked[0].questionId").value(987654321));

        expectFound(a, true);
    }

    @Test
    void anEmptySelectionIsRefused() throws Exception {
        mvc.perform(post("/api/questions/bulk-delete").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"questionIds\":[]}"))
                .andExpect(status().isBadRequest());
    }
}
