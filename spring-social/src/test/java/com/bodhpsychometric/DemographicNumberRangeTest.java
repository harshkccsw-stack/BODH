package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

/**
 * A NUMBER demographic field takes whole numbers only, digits alone (the
 * Number question's rule — no decimals, no sign), within an optional range
 * (V51/V52): a From and To, both inclusive, whole numbers 0 … 15 nines. Only
 * NUMBER keeps one; the portal is sent it to warn early, the begin validator
 * enforces it off the live field, and once answered a new range must still
 * contain every answer already given.
 */
@SpringBootTest
@AutoConfigureMockMvc
class DemographicNumberRangeTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static String field(String label, String type, String min, String max) {
        return "{\"label\":\"" + label + "\",\"fieldType\":\"" + type + "\",\"placeholder\":null,"
                + "\"options\":[" + ("DROPDOWN".equals(type) ? "\"A\"" : "") + "],\"otherOptionLabel\":null,"
                + "\"numberMin\":" + min + ",\"numberMax\":" + max + "}";
    }

    private ResultActions createField(String body) throws Exception {
        return mvc.perform(post("/api/demographic-fields/create").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions updateField(int id, String body) throws Exception {
        return mvc.perform(put("/api/demographic-fields/update/" + id)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private record Taker(int mappingId, String bearer) {
    }

    /** One NUMBER field on a one-question assessment, and a respondent allotted to it. */
    private Taker takerFor(String tag, int fieldId) throws Exception {
        String question = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ " + tag + " stem\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"rows\":[],\"mqtScores\":[]}");
        int questionId = JsonPath.read(question, "$.questionId");
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ " + tag + " QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/demographic-fields")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"demographicFieldId\":" + fieldId + ",\"required\":true}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ " + tag + " Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":true}"),
                "$.assessmentId");
        String email = tag + ".taker@test.local";
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                // Letters only: a person's name may not carry "_" or digits (NameRules).
                "{\"name\":\"Smoke " + tag + "\",\"email\":\"" + email + "\",\"dob\":\"05-05-2005\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9100" + Math.abs(tag.hashCode() % 100000)
                        + "\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");
        String login = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"2005-05-05\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new Taker(JsonPath.read(login, "$.respondent.allottedAssessments[0].respondentAssessmentMappingId"),
                "Bearer " + (String) JsonPath.read(login, "$.token"));
    }

    private ResultActions begin(Taker t, int fieldId, String value) throws Exception {
        return mvc.perform(post("/api/portal/assessments/begin/" + t.mappingId()).header("Authorization", t.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"demographics\":[{\"demographicFieldId\":" + fieldId + ",\"value\":\"" + value + "\"}]}"));
    }

    @Test
    void theRangeIsSavedOnANumberFieldOnlyAndToMustBeAboveFrom() throws Exception {
        createField(field("__smoke__nr age", "NUMBER", "18", "60"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.numberMin").value(18))
                .andExpect(jsonPath("$.numberMax").value(60));

        // Either end may be open.
        createField(field("__smoke__nr floor", "NUMBER", "0", "null"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.numberMin").value(0))
                .andExpect(jsonPath("$.numberMax").doesNotExist());

        // Whole numbers 0 … 15 nines, as the answer itself may be.
        for (String[] ends : new String[][] {{"-5", "null"}, {"null", "1000000000000000"}}) {
            createField(field("__smoke__nr out " + ends[0], "NUMBER", ends[0], ends[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value(
                            "The range's ends must be whole numbers from 0 to 999999999999999"));
        }
        createField(field("__smoke__nr decimal", "NUMBER", "18", "60.5"))
                .andExpect(status().isBadRequest());

        createField(field("__smoke__nr backwards", "NUMBER", "60", "18"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The range's To (18) must be greater than its From (60)"));
        createField(field("__smoke__nr single", "NUMBER", "7", "7"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("must be greater than")));

        // Any other type drops the range, the way a free input drops options.
        createField(field("__smoke__nr text", "TEXT", "1", "5"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.numberMin").doesNotExist())
                .andExpect(jsonPath("$.numberMax").doesNotExist());
        createField(field("__smoke__nr dropdown", "DROPDOWN", "5", "1"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.numberMin").doesNotExist());
    }

    @Test
    void anAnswerOutsideTheRangeIsRefusedAndTheEndsAreIncluded() throws Exception {
        int fieldId = JsonPath.read(postJson("/api/demographic-fields/create",
                field("__smoke__nr years", "NUMBER", "18", "60")), "$.demographicFieldId");
        Taker t = takerFor("nrbegin", fieldId);

        mvc.perform(get("/api/portal/assessments/getById/" + t.mappingId()).header("Authorization", t.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.demographicFields[0].numberMin").value(18))
                .andExpect(jsonPath("$.demographicFields[0].numberMax").value(60));

        for (String bad : new String[] {"17", "61", "400", "32.5", "18.0", "-20", "abc", "NaN"}) {
            begin(t, fieldId, bad)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value(
                            "\"__smoke__nr years\" must be a whole number from 18 to 60"));
        }

        begin(t, fieldId, "18").andExpect(status().isOk());
        begin(t, fieldId, "60").andExpect(status().isOk());
        begin(t, fieldId, " 42 ").andExpect(status().isOk());
    }

    @Test
    void anOpenFieldTakesAnyWholeNumberAndNoDecimalsOrSign() throws Exception {
        int fieldId = JsonPath.read(postJson("/api/demographic-fields/create",
                field("__smoke__nr open", "NUMBER", "null", "null")), "$.demographicFieldId");
        Taker t = takerFor("nropen", fieldId);

        for (String bad : new String[] {"12.5", "12,5", "1,000", "-3", "+3", "1e3", "Infinity", "1234567890123456"}) {
            begin(t, fieldId, bad)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("\"__smoke__nr open\" must be a whole number"));
        }
        begin(t, fieldId, "0").andExpect(status().isOk());
        begin(t, fieldId, "999999999999999").andExpect(status().isOk());
    }

    @Test
    void onceAnsweredANewRangeMustStillContainEveryAnswer() throws Exception {
        int fieldId = JsonPath.read(postJson("/api/demographic-fields/create",
                field("__smoke__nr locked", "NUMBER", "0", "100")), "$.demographicFieldId");
        Taker t = takerFor("nrlock", fieldId);
        begin(t, fieldId, "75").andExpect(status().isOk());

        updateField(fieldId, field("__smoke__nr locked", "NUMBER", "0", "50"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "An answer already given (75) falls outside a range from 0 to 50 — keep every answer inside the range"));
        updateField(fieldId, field("__smoke__nr locked", "NUMBER", "80", "null"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("of 80 or more")));

        // Narrowing that still holds 75 passes, and so does widening or opening an end.
        updateField(fieldId, field("__smoke__nr locked", "NUMBER", "10", "75"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.numberMax").value(75));
        updateField(fieldId, field("__smoke__nr locked", "NUMBER", "null", "null"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.numberMin").doesNotExist());

        // The begin validator reads the live field: after the edit, the old
        // range's 100 is no longer the cap.
        updateField(fieldId, field("__smoke__nr locked", "NUMBER", "0", "80")).andExpect(status().isOk());
        begin(t, fieldId, "90")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.endsWith("must be a whole number from 0 to 80")));
    }
}
