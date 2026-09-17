package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * The public marketing catalog. Two rules carry the whole endpoint: only
 * ACTIVE assessments are visible (by id as well as in the listing, so an
 * unlisted one cannot be reached by guessing), and the payload never leaks
 * internal figures — respondentCount in particular.
 *
 * The detail view also resolves the traits an instrument measures by walking
 * placement -> question -> MQT score -> MQ, which is the one query here with
 * no other test coverage.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PublicProductControllerTest {

    @Autowired
    private MockMvc mvc;

    private int createQuality(String name) throws Exception {
        String body = mvc.perform(post("/api/qualities/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"description\":null}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.measuredQualityId");
    }

    private int createQualityType(int measuredQualityId, String name) throws Exception {
        String body = mvc.perform(post("/api/quality-types/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"measuredQualityId\":" + measuredQualityId
                                + ",\"parentTypeId\":null,\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.measuredQualityTypeId");
    }

    private int createScoredQuestion(String stem, int mqtId) throws Exception {
        String body = mvc.perform(post("/api/questions/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,"
                                + "\"riskFlag\":false,\"options\":["
                                + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqtId + ",\"score\":5}]}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.questionId");
    }

    private int createQuestionnaire(String name) throws Exception {
        String body = mvc.perform(post("/api/questionnaire/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"shortName\":\"SMK\","
                                + "\"category\":\"Screening\",\"vertical\":\"CLINICAL\","
                                + "\"description\":\"A smoke-test instrument.\",\"durationMinutes\":20,"
                                + "\"generalInstruction\":\"Answer honestly.\",\"hasSections\":false}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.questionnaireId");
    }

    private void placeQuestion(int questionnaireId, int questionId) throws Exception {
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId
                                + ",\"sectionId\":null,\"sortOrder\":0}]"))
                .andExpect(status().isOk());
    }

    private int createAssessment(String name, int questionnaireId, String status, String price) throws Exception {
        String body = mvc.perform(post("/api/assessments/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"questionnaireId\":" + questionnaireId
                                + ",\"showTermsAndConditions\":true,\"status\":\"" + status + "\","
                                + "\"autoNext\":false,\"price\":" + price + ",\"currency\":\"inr\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.assessmentId");
    }

    private String listing() throws Exception {
        return mvc.perform(get("/api/public/products/getAll"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void activeAssessmentIsListedWithQuestionnaireCopyAndPrice() throws Exception {
        int questionnaireId = createQuestionnaire("__smoke__Listed Instrument");
        int assessmentId = createAssessment("__smoke__Listed", questionnaireId, "ACTIVE", "1999.00");

        String body = listing();
        List<Integer> ids = JsonPath.read(body, "$[*].assessmentId");
        assertThat(ids).contains(assessmentId);

        String path = "$[?(@.assessmentId == " + assessmentId + ")]";
        assertThat(JsonPath.<List<String>>read(body, path + ".name")).containsExactly("__smoke__Listed");
        assertThat(JsonPath.<List<String>>read(body, path + ".description"))
                .containsExactly("A smoke-test instrument.");
        assertThat(JsonPath.<List<Integer>>read(body, path + ".durationMinutes")).containsExactly(20);
        assertThat(JsonPath.<List<String>>read(body, path + ".category")).containsExactly("Screening");
        assertThat(JsonPath.<List<String>>read(body, path + ".vertical")).containsExactly("CLINICAL");
        // Currency is normalised upward on write, so the site never has to.
        assertThat(JsonPath.<List<String>>read(body, path + ".currency")).containsExactly("INR");
    }

    /** The listing is a marketing surface — internal usage figures stay out of it. */
    @Test
    void publicPayloadNeverExposesRespondentCount() throws Exception {
        int questionnaireId = createQuestionnaire("__smoke__No Leak Instrument");
        int assessmentId = createAssessment("__smoke__No Leak", questionnaireId, "ACTIVE", "500.00");

        assertThat(listing()).doesNotContain("respondentCount");
        mvc.perform(get("/api/public/products/getById/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.respondentCount").doesNotExist())
                .andExpect(jsonPath("$.showTermsAndConditions").doesNotExist())
                .andExpect(jsonPath("$.autoNext").doesNotExist());
    }

    @Test
    void inactiveAssessmentIsNeitherListedNorReachableById() throws Exception {
        int questionnaireId = createQuestionnaire("__smoke__Hidden Instrument");
        int assessmentId = createAssessment("__smoke__Hidden", questionnaireId, "INACTIVE", "750.00");

        List<Integer> ids = JsonPath.read(listing(), "$[*].assessmentId");
        assertThat(ids).doesNotContain(assessmentId);

        mvc.perform(get("/api/public/products/getById/" + assessmentId))
                .andExpect(status().isNotFound());
    }

    @Test
    void unknownIdIsNotFound() throws Exception {
        mvc.perform(get("/api/public/products/getById/999999"))
                .andExpect(status().isNotFound());
    }

    /** An unpriced assessment still lists — the site renders "Price on request". */
    @Test
    void assessmentWithoutPriceStillLists() throws Exception {
        int questionnaireId = createQuestionnaire("__smoke__Unpriced Instrument");
        int assessmentId = createAssessment("__smoke__Unpriced", questionnaireId, "ACTIVE", "null");

        mvc.perform(get("/api/public/products/getById/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.price").doesNotExist())
                .andExpect(jsonPath("$.currency").doesNotExist());
    }

    @Test
    void detailResolvesMeasuredQualitiesThroughPlacedQuestions() throws Exception {
        int mqId = createQuality("__smoke__Resilience");
        int mqtId = createQualityType(mqId, "__smoke__Grit");
        int questionId = createScoredQuestion("__smoke__ I bounce back.", mqtId);
        int questionnaireId = createQuestionnaire("__smoke__Scored Instrument");
        placeQuestion(questionnaireId, questionId);
        int assessmentId = createAssessment("__smoke__Scored", questionnaireId, "ACTIVE", "2500.00");

        mvc.perform(get("/api/public/products/getById/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionCount").value(1))
                .andExpect(jsonPath("$.questionnaireName").value("__smoke__Scored Instrument"))
                .andExpect(jsonPath("$.generalInstruction").value("Answer honestly."))
                .andExpect(jsonPath("$.measuredQualities[0]").value("__smoke__Resilience"));
    }
}
