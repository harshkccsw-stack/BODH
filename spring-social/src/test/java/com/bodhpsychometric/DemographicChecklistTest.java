package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.model.demographics.DemographicResponse;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;
import com.bodhpsychometric.service.datastudio.DataStudioDatasetService;
import com.jayway.jsonpath.JsonPath;

/**
 * The CHECKLIST demographic type and the write-in "Other" choice (V39,
 * docs/demographic-other-and-checklist-plan.md). A checklist is one answer row
 * PER TICK; every other type stays one row, and the database still enforces
 * that. The write-in is a field-level label, not an option row, and its text
 * rides on the row that picked it.
 */
@SpringBootTest
@AutoConfigureMockMvc
class DemographicChecklistTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private DemographicResponseRepository demographicResponses;

    @Autowired
    private DataStudioDatasetService datasets;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static String field(String label, String type, String options, String otherLabel) {
        return "{\"label\":\"" + label + "\",\"fieldType\":\"" + type + "\",\"placeholder\":null,"
                + "\"options\":[" + options + "],\"otherOptionLabel\":"
                + (otherLabel == null ? "null" : "\"" + otherLabel + "\"") + "}";
    }

    private int newField(String label, String type, String options, String otherLabel) throws Exception {
        return JsonPath.read(postJson("/api/demographic-fields/create", field(label, type, options, otherLabel)),
                "$.demographicFieldId");
    }

    /** One attempt with a three-field form: a checklist, a dropdown (both with a write-in) and a text box. */
    private record Fixture(int assessmentId, int checklistId, int dropdownId, int textId, int questionId,
            int optionId, List<Taker> takers) {
    }

    private record Taker(int respondentUserId, int mappingId, String bearer) {
    }

    private Fixture fixture(String tag, int takers) throws Exception {
        int checklistId = newField("__smoke__" + tag + " devices", "CHECKLIST",
                "\"Smartphone\",\"Laptop\",\"Tablet\"", "Other (specify)");
        int dropdownId = newField("__smoke__" + tag + " city", "DROPDOWN", "\"Delhi\",\"Pune\"", "Other city");
        int textId = newField("__smoke__" + tag + " school", "TEXT", "", null);

        String question = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ " + tag + " stem\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                        + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"rows\":[],\"mqtScores\":[]}");
        int questionId = JsonPath.read(question, "$.questionId");
        int optionId = JsonPath.read(question, "$.options[0].optionId");

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
                        .content("[{\"demographicFieldId\":" + checklistId + ",\"required\":true},"
                                + "{\"demographicFieldId\":" + dropdownId + ",\"required\":true},"
                                + "{\"demographicFieldId\":" + textId + ",\"required\":false}]"))
                .andExpect(status().isOk());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ " + tag + " Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":true}"),
                "$.assessmentId");

        List<Taker> list = new java.util.ArrayList<>();
        for (int i = 0; i < takers; i++) {
            String email = tag + ".taker" + i + "@test.local";
            int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                    "{\"name\":\"__smoke__ " + tag + " " + i + "\",\"email\":\"" + email + "\",\"dob\":\"05-05-2005\","
                            + "\"phoneCountryCode\":\"+91\",\"phone\":\"90000" + Math.abs(tag.hashCode() % 10000)
                            + i + "\",\"gender\":\"FEMALE\",\"isConsented\":false,\"organizationId\":null}"),
                    "$.respondentUserId");
            postJson("/api/respondent-assessments/assign",
                    "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");
            String login = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"" + email + "\",\"dob\":\"2005-05-05\"}"))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            list.add(new Taker(respondentUserId,
                    JsonPath.read(login, "$.respondent.allottedAssessments[0].respondentAssessmentMappingId"),
                    "Bearer " + (String) JsonPath.read(login, "$.token")));
        }
        return new Fixture(assessmentId, checklistId, dropdownId, textId, questionId, optionId, list);
    }

    private org.springframework.test.web.servlet.ResultActions begin(Taker t, String demographics) throws Exception {
        return mvc.perform(post("/api/portal/assessments/begin/" + t.mappingId()).header("Authorization", t.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[" + demographics + "]}"));
    }

    private void submit(Fixture f, Taker t) throws Exception {
        mvc.perform(post("/api/portal/assessments/submit/" + t.mappingId()).header("Authorization", t.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + f.questionId() + ",\"optionId\":" + f.optionId() + "}]}"))
                .andExpect(status().isOk());
    }

    private static String ticks(int fieldId, String values, String otherText) {
        return "{\"demographicFieldId\":" + fieldId + ",\"values\":[" + values + "]"
                + (otherText == null ? "" : ",\"otherText\":\"" + otherText + "\"") + "}";
    }

    private static String one(int fieldId, String value, String otherText) {
        return "{\"demographicFieldId\":" + fieldId + ",\"value\":\"" + value + "\""
                + (otherText == null ? "" : ",\"otherText\":\"" + otherText + "\"") + "}";
    }

    // ── The field registry ───────────────────────────────────────────────

    @Test
    void aChoiceFieldsOptionsMustBeDistinctAndTheWriteInIsItsOwnChoice() throws Exception {
        mvc.perform(post("/api/demographic-fields/create").contentType(MediaType.APPLICATION_JSON)
                        .content(field("__smoke__cl empty", "CHECKLIST", "", "Other")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("A CHECKLIST field needs at least one option"));
        mvc.perform(post("/api/demographic-fields/create").contentType(MediaType.APPLICATION_JSON)
                        .content(field("__smoke__cl twice", "CHECKLIST", "\"Laptop\",\"laptop \"", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("listed twice")));
        // The write-in may not repeat an option — a dropdown's included.
        mvc.perform(post("/api/demographic-fields/create").contentType(MediaType.APPLICATION_JSON)
                        .content(field("__smoke__dd other twice", "DROPDOWN", "\"Male\",\"Other\"", "other")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("already one of the options")));
        // A ']' would end the Data Studio column reference early.
        mvc.perform(post("/api/demographic-fields/create").contentType(MediaType.APPLICATION_JSON)
                        .content(field("__smoke__cl bracket", "CHECKLIST", "\"Phone [old]\"", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("\"]\"")));

        // A plain "Other" option is just an option; the write-in is separate,
        // trimmed, and delivered last.
        mvc.perform(post("/api/demographic-fields/create").contentType(MediaType.APPLICATION_JSON)
                        .content(field("__smoke__cl ok", "CHECKLIST", "\" Laptop \",\"Other\"", "  Something else  ")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fieldType").value("CHECKLIST"))
                .andExpect(jsonPath("$.options[0]").value("Laptop"))
                .andExpect(jsonPath("$.options.length()").value(2))
                .andExpect(jsonPath("$.otherOptionLabel").value("Something else"));

        // Free-input types keep neither options nor a write-in.
        mvc.perform(post("/api/demographic-fields/create").contentType(MediaType.APPLICATION_JSON)
                        .content(field("__smoke__text with other", "TEXT", "\"x\"", "Other")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.options.length()").value(0))
                .andExpect(jsonPath("$.otherOptionLabel").value(Matchers.nullValue()));
    }

    // ── Answering ────────────────────────────────────────────────────────

    @Test
    void aChecklistStoresOneRowPerTickAndTheWriteInNeedsItsText() throws Exception {
        Fixture f = fixture("clbegin", 1);
        Taker t = f.takers().get(0);

        mvc.perform(get("/api/portal/assessments/getById/" + t.mappingId()).header("Authorization", t.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.demographicFields[0].fieldType").value("CHECKLIST"))
                .andExpect(jsonPath("$.demographicFields[0].options.length()").value(3))
                .andExpect(jsonPath("$.demographicFields[0].otherOptionLabel").value("Other (specify)"));

        String city = one(f.dropdownId(), "Delhi", null);
        // Wrong shapes, each way round.
        begin(t, one(f.checklistId(), "Laptop", null) + "," + city)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("send the ticked options as values")));
        begin(t, ticks(f.checklistId(), "\"Laptop\"", null) + "," + ticks(f.dropdownId(), "\"Delhi\"", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("takes one value, not a list")));
        // Nothing ticked on a required checklist, and a tick that is not a choice.
        begin(t, ticks(f.checklistId(), "", null) + "," + city)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("Tick at least one option")));
        begin(t, ticks(f.checklistId(), "\"laptop\"", null) + "," + city)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("is not one of")));
        // Other ticked with no text, blank text, or too much text.
        begin(t, ticks(f.checklistId(), "\"Other (specify)\"", null) + "," + city)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("Please specify")));
        begin(t, ticks(f.checklistId(), "\"Other (specify)\"", "   ") + "," + city)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("Please specify")));
        begin(t, ticks(f.checklistId(), "\"Other (specify)\"", "x".repeat(256)) + "," + city)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("at most 255 characters")));
        // Text with no Other behind it — on a choice field and on a text box.
        begin(t, ticks(f.checklistId(), "\"Laptop\"", "glasses") + "," + city)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("only takes typed text")));
        begin(t, ticks(f.checklistId(), "\"Laptop\"", null) + "," + city + "," + one(f.textId(), "DPS", "x"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("only takes typed text")));

        // Ticks out of order with a repeat: stored once each, in choice order,
        // the text on the Other row only. The dropdown's write-in works the same.
        begin(t, ticks(f.checklistId(), "\"Other (specify)\",\"Tablet\",\"Smartphone\",\"Tablet\"", "  Smart glasses ")
                        + "," + one(f.dropdownId(), "Other city", "Indore"))
                .andExpect(status().isOk());

        List<DemographicResponse> rows = demographicResponses.findForExport((long) f.assessmentId(),
                List.of((long) t.respondentUserId()));
        List<DemographicResponse> checklistRows = rows.stream()
                .filter(r -> r.getDemographicField().getDemographicFieldId() == f.checklistId()).toList();
        assertThat(checklistRows).extracting(DemographicResponse::getResponseValue)
                .containsExactlyInAnyOrder("Smartphone", "Tablet", "Other (specify)");
        assertThat(checklistRows).allSatisfy(r -> assertThat(r.getOptionValue()).isEqualTo(r.getResponseValue()));
        assertThat(checklistRows).filteredOn(r -> r.getOtherText() != null)
                .extracting(DemographicResponse::getOtherText).containsExactly("Smart glasses");
        DemographicResponse cityRow = rows.stream()
                .filter(r -> r.getDemographicField().getDemographicFieldId() == f.dropdownId()).findFirst().orElseThrow();
        assertThat(cityRow.getResponseValue()).isEqualTo("Other city");
        assertThat(cityRow.getOptionValue()).isEmpty();
        assertThat(cityRow.getOtherText()).isEqualTo("Indore");

        // Re-entering the form (begin again while ONGOING) replaces every tick.
        begin(t, ticks(f.checklistId(), "\"Laptop\"", null) + "," + city).andExpect(status().isOk());
        assertThat(demographicResponses.findForExport((long) f.assessmentId(), List.of((long) t.respondentUserId())))
                .extracting(DemographicResponse::getResponseValue).containsExactlyInAnyOrder("Laptop", "Delhi");
    }

    /**
     * Risk 2 of the plan: one row per tick must not cost the single-value
     * types their one-answer guarantee. optionValue is '' on all of them, so a
     * second answer for the same dropdown hits the unique key — at the
     * database, not just in the service.
     */
    @Test
    void theDatabaseStillAllowsOneAnswerPerSingleValueField() throws Exception {
        Fixture f = fixture("clsingle", 1);
        Taker t = f.takers().get(0);
        begin(t, ticks(f.checklistId(), "\"Laptop\",\"Tablet\"", null) + "," + one(f.dropdownId(), "Delhi", null))
                .andExpect(status().isOk());

        DemographicResponse city = demographicResponses.findForExport((long) f.assessmentId(),
                        List.of((long) t.respondentUserId())).stream()
                .filter(r -> r.getDemographicField().getDemographicFieldId() == f.dropdownId()).findFirst().orElseThrow();
        DemographicResponse second = new DemographicResponse();
        second.setRespondent(city.getRespondent());
        second.setAssessment(city.getAssessment());
        second.setDemographicField(city.getDemographicField());
        second.setResponseValue("Pune");
        assertThatThrownBy(() -> demographicResponses.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ── Reading it back ──────────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void exportDataStudioAndTheRespondentCountReadEveryTick() throws Exception {
        Fixture f = fixture("clread", 2);
        Taker ravi = f.takers().get(0);
        Taker meera = f.takers().get(1);
        begin(ravi, ticks(f.checklistId(), "\"Other (specify)\",\"Smartphone\",\"Laptop\"", "Smart glasses")
                + "," + one(f.dropdownId(), "Other city", "Indore")).andExpect(status().isOk());
        submit(f, ravi);
        begin(meera, ticks(f.checklistId(), "\"Laptop\"", null) + "," + one(f.dropdownId(), "Pune", null))
                .andExpect(status().isOk());
        submit(f, meera);

        // Export: column metadata for the per-choice layout, every tick on the
        // row (the old map-by-field kept only the last), the text beside it.
        String sheet = mvc.perform(get("/api/reports/export/assessment/" + f.assessmentId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.demographicColumns[0].fieldType").value("CHECKLIST"))
                .andExpect(jsonPath("$.demographicColumns[0].options.length()").value(3))
                .andExpect(jsonPath("$.demographicColumns[0].otherOptionLabel").value("Other (specify)"))
                .andExpect(jsonPath("$.demographicColumns[2].otherOptionLabel").value(Matchers.nullValue()))
                .andReturn().getResponse().getContentAsString();
        int raviRow = ((Integer) JsonPath.read(sheet, "$.rows[0].respondentUserId")) == ravi.respondentUserId() ? 0 : 1;
        String r = "$.rows[" + raviRow + "]";
        String m = "$.rows[" + (1 - raviRow) + "]";
        String cl = String.valueOf(f.checklistId());
        String dd = String.valueOf(f.dropdownId());
        assertThat((String) JsonPath.read(sheet, r + ".demographics." + cl))
                .isEqualTo("Smartphone; Laptop; Other (specify)");
        assertThat((List<String>) JsonPath.read(sheet, r + ".demographicSelections." + cl))
                .containsExactly("Smartphone", "Laptop", "Other (specify)");
        assertThat((String) JsonPath.read(sheet, r + ".demographicOtherTexts." + cl)).isEqualTo("Smart glasses");
        assertThat((String) JsonPath.read(sheet, r + ".demographics." + dd)).isEqualTo("Other city");
        assertThat((String) JsonPath.read(sheet, r + ".demographicOtherTexts." + dd)).isEqualTo("Indore");
        assertThat((List<String>) JsonPath.read(sheet, m + ".demographicSelections." + cl)).containsExactly("Laptop");
        assertThat((Map<String, Object>) JsonPath.read(sheet, m + ".demographicOtherTexts")).isEmpty();

        // Data Studio: a 1/0 column per choice (null when unanswered), the
        // typed text in its own column.
        DsDatasetResponse ds = datasets.dataset((long) f.assessmentId(), null).orElseThrow();
        String laptop = "demo:" + cl + ":opt:Laptop";
        String other = "demo:" + cl + ":opt:Other (specify)";
        assertThat(ds.columns()).extracting(DsDatasetResponse.Column::key).contains(
                "demo:" + cl, "demo:" + cl + ":opt:Smartphone", laptop, "demo:" + cl + ":opt:Tablet", other,
                "demo:" + cl + ":other", "demo:" + dd + ":other");
        assertThat(ds.columns()).extracting(DsDatasetResponse.Column::key).doesNotContain("demo:" + f.textId() + ":other");
        Map<String, Object> raviDs = ds.rows().stream()
                .filter(row -> ((Number) row.get("core:respondentId")).intValue() == ravi.respondentUserId())
                .findFirst().orElseThrow();
        assertThat(raviDs.get(laptop)).isEqualTo(1);
        assertThat(raviDs.get("demo:" + cl + ":opt:Tablet")).isEqualTo(0);
        assertThat(raviDs.get(other)).isEqualTo(1);
        assertThat(raviDs.get("demo:" + cl + ":other")).isEqualTo("Smart glasses");
        assertThat(raviDs.get("demo:" + cl)).isEqualTo("Smartphone; Laptop; Other (specify)");

        // Three ticks are still ONE answered field: checklist + city = 2.
        mvc.perform(get("/api/reports/getRespondentDetail/" + ravi.respondentUserId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessments[0].demographicResponses").value(2));
    }

    // ── Editing a field people have answered ─────────────────────────────

    @Test
    void answersLockTheTypeAndEveryChoiceSomebodyPicked() throws Exception {
        Fixture f = fixture("cllock", 1);
        Taker t = f.takers().get(0);
        String update = "/api/demographic-fields/update/" + f.checklistId();
        String label = "__smoke__cllock devices";

        // Nobody has answered yet: anything goes, renames included.
        mvc.perform(put(update).contentType(MediaType.APPLICATION_JSON)
                        .content(field(label, "CHECKLIST", "\"Smartphone\",\"Laptop\",\"Tablet\"", "Other (specify)")))
                .andExpect(status().isOk());

        begin(t, ticks(f.checklistId(), "\"Laptop\",\"Other (specify)\"", "VR") + "," + one(f.dropdownId(), "Delhi", null))
                .andExpect(status().isOk());

        // The type is now fixed.
        mvc.perform(put(update).contentType(MediaType.APPLICATION_JSON)
                        .content(field(label, "DROPDOWN", "\"Smartphone\",\"Laptop\",\"Tablet\"", "Other (specify)")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This field already has answers, so its type can't be changed"));
        // A picked option cannot be renamed or removed …
        mvc.perform(put(update).contentType(MediaType.APPLICATION_JSON)
                        .content(field(label, "CHECKLIST", "\"Smartphone\",\"Notebook\",\"Tablet\"", "Other (specify)")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("\"Laptop\" has answers, so it can't be renamed or removed"));
        // … nor can the write-in somebody used.
        mvc.perform(put(update).contentType(MediaType.APPLICATION_JSON)
                        .content(field(label, "CHECKLIST", "\"Smartphone\",\"Laptop\",\"Tablet\"", "Something else")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("Other (specify)")));

        // Unpicked options may go, and new ones arrive in any order.
        mvc.perform(put(update).contentType(MediaType.APPLICATION_JSON)
                        .content(field(label, "CHECKLIST", "\"Desktop\",\"Laptop\",\"Smartwatch\"", "Other (specify)")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.options[0]").value("Desktop"))
                .andExpect(jsonPath("$.options.length()").value(3));
    }
}
