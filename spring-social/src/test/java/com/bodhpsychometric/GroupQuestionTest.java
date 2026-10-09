package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

import com.jayway.jsonpath.JsonPath;

/**
 * The Group question (V49, docs/group-question-plan.md): a bank item of type
 * GROUP whose stem is an OPTIONAL heading and whose content is its MEMBERS —
 * full questions of their own (own options, own MQ/MQT scores), hung off the
 * parent, hidden from bank-wide lists, and PLACED in the parent's stead: the
 * parent never carries a placement, a tag or an answer. The members travel as
 * one block — all placed together, contiguous, in the group's order — and the
 * portal folds consecutive questions sharing a groupId into one page.
 */
@SpringBootTest
@AutoConfigureMockMvc
class GroupQuestionTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private int newMqt(String tag) throws Exception {
        String mq = postJson("/api/qualities/create", "{\"name\":\"" + tag + "\",\"description\":null}");
        int measuredQualityId = JsonPath.read(mq, "$.measuredQualityId");
        String mqt = postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + measuredQualityId + ",\"parentTypeId\":null,"
                        + "\"name\":\"" + tag + " type\"}");
        return JsonPath.read(mqt, "$.measuredQualityTypeId");
    }

    private static String mcqMember(String stem, int mqt) {
        return "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"" + stem + "\","
                + "\"mediaUrl\":null,\"riskFlag\":false,"
                + "\"options\":["
                + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":2}]},"
                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":1}]}";
    }

    private static String shortAnswerMember(String stem) {
        return "{\"contentType\":\"TEXT\",\"questionType\":\"SHORT_ANSWER\",\"stem\":\"" + stem + "\","
                + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[],\"mqtScores\":[]}";
    }

    private static String groupJson(String heading, String... members) {
        return "{\"contentType\":\"TEXT\",\"questionType\":\"GROUP\","
                + "\"stem\":" + (heading == null ? "null" : "\"" + heading + "\"") + ","
                + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[],\"mqtScores\":[],"
                + "\"members\":[" + String.join(",", members) + "]}";
    }

    @Test
    void aGroupNestsItsMembersAndHidesThemFromTheBank() throws Exception {
        int mqt = newMqt("__smoke__grpBank");
        String body = postJson("/api/questions/create", groupJson(null,
                mcqMember("__smoke__ grp member one", mqt),
                shortAnswerMember("__smoke__ grp member two")));
        int groupId = JsonPath.read(body, "$.questionId");
        int memberOne = JsonPath.read(body, "$.members[0].questionId");

        // The heading is optional — this group has none — and the members
        // come back nested, in order, each a full question with its own
        // options and scores.
        mvc.perform(get("/api/questions/getById/" + groupId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionType").value("GROUP"))
                .andExpect(jsonPath("$.stem").value(Matchers.nullValue()))
                .andExpect(jsonPath("$.options.length()").value(0))
                .andExpect(jsonPath("$.members.length()").value(2))
                .andExpect(jsonPath("$.members[0].stem").value("__smoke__ grp member one"))
                .andExpect(jsonPath("$.members[0].parentQuestionId").value(groupId))
                .andExpect(jsonPath("$.members[0].options.length()").value(2))
                .andExpect(jsonPath("$.members[0].options[0].mqtScores[0].score").value(2))
                .andExpect(jsonPath("$.members[0].mqtScores[0].score").value(1))
                .andExpect(jsonPath("$.members[1].questionType").value("SHORT_ANSWER"));

        // The bank lists the group as ONE row; the members ride nested inside
        // it, never as top-level rows of their own.
        String all = mvc.perform(get("/api/questions/getAll")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        java.util.List<Integer> bankIds = JsonPath.read(all, "$[*].questionId");
        org.junit.jupiter.api.Assertions.assertTrue(bankIds.contains(groupId));
        org.junit.jupiter.api.Assertions.assertFalse(bankIds.contains(memberOne),
                "a member must not surface as a bank row of its own");

        // A member cannot be edited or deleted by its own id.
        mvc.perform(put("/api/questions/update/" + memberOne).contentType(MediaType.APPLICATION_JSON)
                        .content(mcqMember("__smoke__ hijack", mqt)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("belongs to a group")));
        mvc.perform(delete("/api/questions/delete/" + memberOne))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("belongs to a group")));

        // Deleting the group takes the members with it.
        mvc.perform(delete("/api/questions/delete/" + groupId)).andExpect(status().isNoContent());
        mvc.perform(get("/api/questions/getById/" + memberOne)).andExpect(status().isNotFound());
    }

    @Test
    void aGroupIsValidatedAsAWholeAndItsMembersByTheirOwnRules() throws Exception {
        int mqt = newMqt("__smoke__grpVal");

        // One member is just a question.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(groupJson("__smoke__ lonely", mcqMember("__smoke__ only", mqt))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("at least two questions")));

        // A member is held to its own type's rules, named by its position.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(groupJson("__smoke__ bad member",
                                mcqMember("__smoke__ fine", mqt),
                                "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ optionless\","
                                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[],\"mqtScores\":[]}")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("question 2 in the group")))
                .andExpect(jsonPath("$.message").value(Matchers.containsString("at least one option")));

        // No nesting, and the parent carries nothing of its own.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(groupJson("__smoke__ nested",
                                mcqMember("__smoke__ fine", mqt),
                                groupJson(null, mcqMember("__smoke__ in", mqt), mcqMember("__smoke__ ner", mqt)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("cannot contain another group")));
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"GROUP\",\"stem\":null,"
                                + "\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"stray\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[],"
                                + "\"members\":[" + mcqMember("__smoke__ a", mqt) + "," + mcqMember("__smoke__ b", mqt) + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("options belong to its questions")));

        // members anywhere else would be silently dropped — refused instead.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ not a group\","
                                + "\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[],"
                                + "\"members\":[" + mcqMember("__smoke__ stray", mqt) + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("members is only for a group")));

        // The blank-stem rule moved off the DTO for the heading's sake and
        // must still hold everywhere else.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"  \","
                                + "\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("stem is required"));
    }

    @Test
    void membersArePlacedAsOneBlockOrNotAtAll() throws Exception {
        int mqt = newMqt("__smoke__grpPlace");
        String body = postJson("/api/questions/create", groupJson("__smoke__ block",
                mcqMember("__smoke__ pm one", mqt), mcqMember("__smoke__ pm two", mqt)));
        int groupId = JsonPath.read(body, "$.questionId");
        int memberOne = JsonPath.read(body, "$.members[0].questionId");
        int memberTwo = JsonPath.read(body, "$.members[1].questionId");
        int loner = JsonPath.read(postJson("/api/questions/create", mcqMember("__smoke__ loner", mqt)),
                "$.questionId");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ grp place QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");

        // The parent itself is never a placement.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + groupId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("is a group")));

        // One member alone is not a placement either…
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + memberOne + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("placed whole")));

        // …nor members with a stranger wedged between them…
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + memberOne + ",\"sectionId\":null,\"sortOrder\":1},"
                                + "{\"questionId\":" + loner + ",\"sectionId\":null,\"sortOrder\":2},"
                                + "{\"questionId\":" + memberTwo + ",\"sectionId\":null,\"sortOrder\":3}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("nothing between them")));

        // …nor the members out of the group's own order.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + memberTwo + ",\"sectionId\":null,\"sortOrder\":1},"
                                + "{\"questionId\":" + memberOne + ",\"sectionId\":null,\"sortOrder\":2}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("group's own order")));

        // Whole, contiguous, in order: placed — and tagged as ordinary
        // questions, Q_1..Q_3, because that is what they are.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + memberOne + ",\"sectionId\":null,\"sortOrder\":1},"
                                + "{\"questionId\":" + memberTwo + ",\"sectionId\":null,\"sortOrder\":2},"
                                + "{\"questionId\":" + loner + ",\"sectionId\":null,\"sortOrder\":3}]"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].questionTag").value("Q_1"))
                .andExpect(jsonPath("$[0].parentQuestionId").value(groupId))
                .andExpect(jsonPath("$[0].groupHeading").value("__smoke__ block"))
                .andExpect(jsonPath("$[2].questionTag").value("Q_3"))
                .andExpect(jsonPath("$[2].parentQuestionId").value(Matchers.nullValue()));

        // Placed, the group tells the bank where it is used…
        mvc.perform(get("/api/questions/getById/" + groupId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usedIn.length()").value(1));

        // …its membership may still change (nobody has answered), and the
        // questionnaire's placements FOLLOW: the new third member slots in
        // after its siblings, required, the loner moves down, and every tag
        // is re-stamped — exactly what the builder's save relies on.
        String grown = mvc.perform(put("/api/questions/update/" + groupId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"GROUP\",\"stem\":\"__smoke__ block\","
                                + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[],\"mqtScores\":[],"
                                + "\"members\":["
                                + "{\"questionId\":" + memberOne + ",\"contentType\":\"TEXT\",\"questionType\":\"MCQ\","
                                + "\"stem\":\"__smoke__ pm one\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":2}]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":1}]},"
                                + "{\"questionId\":" + memberTwo + ",\"contentType\":\"TEXT\",\"questionType\":\"MCQ\","
                                + "\"stem\":\"__smoke__ pm two\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":2}]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":1}]},"
                                + mcqMember("__smoke__ pm three", mqt) + "]}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int memberThree = JsonPath.read(grown, "$.members[2].questionId");
        mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].questionId").value(memberOne))
                .andExpect(jsonPath("$[2].questionId").value(memberThree))
                .andExpect(jsonPath("$[2].questionTag").value("Q_3"))
                .andExpect(jsonPath("$[2].optional").value(false))
                .andExpect(jsonPath("$[3].questionId").value(loner))
                .andExpect(jsonPath("$[3].questionTag").value("Q_4"));
        // A placed group still cannot be deleted.
        mvc.perform(delete("/api/questions/delete/" + groupId))
                .andExpect(status().isConflict());
    }

    @Test
    void theGroupDeliversAsOneBlockAndItsMembersAnswerAndExportAlone() throws Exception {
        int mqt = newMqt("__smoke__grpPortal");
        String body = postJson("/api/questions/create", groupJson("__smoke__ About your week",
                mcqMember("__smoke__ gp one", mqt), shortAnswerMember("__smoke__ gp two")));
        int groupId = JsonPath.read(body, "$.questionId");
        int memberOne = JsonPath.read(body, "$.members[0].questionId");
        int memberTwo = JsonPath.read(body, "$.members[1].questionId");
        int yes = JsonPath.read(body, "$.members[0].options[0].optionId");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ grp portal QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + memberOne + ",\"sectionId\":null,\"sortOrder\":1},"
                                + "{\"questionId\":" + memberTwo + ",\"sectionId\":null,\"sortOrder\":2}]"))
                .andExpect(status().isOk());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ grp Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Group Taker\",\"email\":\"group.taker@test.local\",\"dob\":\"05-05-2005\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000001\",\"gender\":\"FEMALE\","
                        + "\"isConsented\":false,\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"group.taker@test.local\",\"dob\":\"2005-05-05\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // Two ordinary questions, each wearing the group's id and heading —
        // what the portal folds into one page. The parent is not delivered.
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions.length()").value(2))
                .andExpect(jsonPath("$.questions[0].groupId").value(groupId))
                .andExpect(jsonPath("$.questions[0].groupHeading").value("__smoke__ About your week"))
                .andExpect(jsonPath("$.questions[1].groupId").value(groupId))
                .andExpect(jsonPath("$.questions[1].questionType").value("SHORT_ANSWER"));

        // Each member answers as itself: an option pick and a typed answer.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + memberOne + ",\"optionId\":" + yes + "},"
                                + "{\"questionId\":" + memberTwo + ",\"answerText\":\"typed in a group\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // One export column per member, like any two questions.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionColumns.length()").value(2))
                .andExpect(jsonPath("$.questionColumns[0].questionTag").value("Q_1"))
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("Yes"))
                .andExpect(jsonPath("$.rows[0].answers.Q_2").value("typed in a group"));

        // Answers freeze the group: membership is locked…
        mvc.perform(put("/api/questions/update/" + groupId).contentType(MediaType.APPLICATION_JSON)
                        .content(groupJson("__smoke__ About your week",
                                mcqMember("__smoke__ gp one", mqt), shortAnswerMember("__smoke__ gp two"),
                                mcqMember("__smoke__ gp three", mqt))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("questions are locked")));

        // …and an answered member's options are locked through the group's
        // payload exactly as they would be alone…
        mvc.perform(put("/api/questions/update/" + groupId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"GROUP\","
                                + "\"stem\":\"__smoke__ About your week\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[],\"mqtScores\":[],"
                                + "\"members\":["
                                + "{\"questionId\":" + memberOne + ",\"contentType\":\"TEXT\",\"questionType\":\"MCQ\","
                                + "\"stem\":\"__smoke__ gp one\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"Changed\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]},"
                                + "{\"questionId\":" + memberTwo + ",\"contentType\":\"TEXT\",\"questionType\":\"SHORT_ANSWER\","
                                + "\"stem\":\"__smoke__ gp two\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[],\"mqtScores\":[]}]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("options are locked")));

        // …while the heading, a member's wording and every score stay
        // editable: same members, same options, new heading and new scores.
        mvc.perform(put("/api/questions/update/" + groupId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"GROUP\","
                                + "\"stem\":\"__smoke__ About your fortnight\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[],\"mqtScores\":[],"
                                + "\"members\":["
                                + "{\"questionId\":" + memberOne + ",\"contentType\":\"TEXT\",\"questionType\":\"MCQ\","
                                + "\"stem\":\"__smoke__ gp one\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":["
                                + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":5}]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]},"
                                + "{\"questionId\":" + memberTwo + ",\"contentType\":\"TEXT\",\"questionType\":\"SHORT_ANSWER\","
                                + "\"stem\":\"__smoke__ gp two reworded\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[],\"mqtScores\":[]}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stem").value("__smoke__ About your fortnight"))
                .andExpect(jsonPath("$.members[0].options[0].mqtScores[0].score").value(5))
                .andExpect(jsonPath("$.members[1].stem").value("__smoke__ gp two reworded"));
    }

    @Test
    void anUnansweredUnplacedGroupEditsFreely() throws Exception {
        int mqt = newMqt("__smoke__grpEdit");
        String body = postJson("/api/questions/create", groupJson("__smoke__ editable",
                mcqMember("__smoke__ ge one", mqt), mcqMember("__smoke__ ge two", mqt)));
        int groupId = JsonPath.read(body, "$.questionId");
        int keepId = JsonPath.read(body, "$.members[0].questionId");
        int dropId = JsonPath.read(body, "$.members[1].questionId");

        // Keep one by id, drop the other, add a new one — and the kept
        // member's identity (its questionId, hence any future answers)
        // survives the save.
        String updated = mvc.perform(put("/api/questions/update/" + groupId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"GROUP\",\"stem\":null,"
                                + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[],\"mqtScores\":[],"
                                + "\"members\":["
                                + "{\"questionId\":" + keepId + ",\"contentType\":\"TEXT\",\"questionType\":\"MCQ\","
                                + "\"stem\":\"__smoke__ ge one\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                                + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqt + ",\"score\":2}]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]},"
                                + shortAnswerMember("__smoke__ ge new") + "]}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertEquals(keepId,
                (int) JsonPath.read(updated, "$.members[0].questionId"));
        org.junit.jupiter.api.Assertions.assertEquals("__smoke__ ge new",
                JsonPath.read(updated, "$.members[1].stem"));
        mvc.perform(get("/api/questions/getById/" + dropId)).andExpect(status().isNotFound());

        // A member id from some other group (or none) is a stale page.
        mvc.perform(put("/api/questions/update/" + groupId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"GROUP\",\"stem\":null,"
                                + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[],\"mqtScores\":[],"
                                + "\"members\":["
                                + "{\"questionId\":999999,\"contentType\":\"TEXT\",\"questionType\":\"MCQ\","
                                + "\"stem\":\"__smoke__ ghost\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]},"
                                + mcqMember("__smoke__ ge other", mqt) + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("not one of this group's questions")));
    }
}
