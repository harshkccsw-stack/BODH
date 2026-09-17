package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;

/**
 * Importing an item sheet, over HTTP, against a real questionnaire.
 *
 * <h2>What this is proving</h2>
 *
 * <p>The item sheet is the dictionary a scoring workbook is written in. If
 * {@code I1} binds to the wrong question, every rule that mentions it is wrong
 * in a way no reader of the report can see. So the assertions here are about
 * identity, not plumbing: which question each code resolved to, which trait,
 * and — the headline claim of the whole design — that a construct name shared
 * by two qualities resolves by the FACTOR beside it rather than ambiguously.
 *
 * <p>The statements are the psychometrician's own, copied from the Academic
 * Drive workbook's Items_Master tab, because the wording is the join and
 * invented wording would match itself too easily.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ItemBindingImportTest {

    @Autowired
    private MockMvc mvc;

    private static final ObjectMapper JSON = new ObjectMapper();

    /* The four statements, verbatim from the workbook. */
    private static final String I1 =
            "If I get a totally new kind of task or role, I am sure I can learn what it needs.";
    private static final String I2 =
            "Even in things I am weak at today, regular practice can make me really good at them.";
    private static final String I3 =
            "When something does not come naturally to me, I take it as a sign I am just not "
            + "built for it.";
    private static final String V3 = "I have attended at least one class or meeting in the past year.";

    private int assessmentId;
    private int driveSelfEfficacy;
    private int validitySelfEfficacy;
    private int questionI1;
    private int questionV3;
    private String driveFactor;
    private String validityFactor;

    /* ===================== the fixture ===================== */

    @BeforeEach
    void buildAssessment() throws Exception {
        String unique = "__smoke__ " + System.nanoTime();
        driveFactor = unique + " Internal Drive";
        validityFactor = unique + " Validity";

        int driveMq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":" + s(driveFactor) + ",\"description\":null}"), "$.measuredQualityId");
        int validityMq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":" + s(validityFactor) + ",\"description\":null}"),
                "$.measuredQualityId");

        // The SAME construct name under both qualities, deliberately. MQT names
        // are not unique in this product, so a binding that matched on the
        // construct alone would be a coin toss — this is the case the factor
        // column exists to settle.
        driveSelfEfficacy = mqt(driveMq, "Self-Efficacy");
        validitySelfEfficacy = mqt(validityMq, "Self-Efficacy");

        questionI1 = JsonPath.read(likertItem(I1, driveSelfEfficacy), "$.questionId");
        int i2 = JsonPath.read(likertItem(I2, driveSelfEfficacy), "$.questionId");
        int i3 = JsonPath.read(likertItem(I3, driveSelfEfficacy), "$.questionId");
        questionV3 = JsonPath.read(likertItem(V3, validitySelfEfficacy), "$.questionId");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":" + s(unique + " QNR") + ",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");

        StringBuilder placements = new StringBuilder("[");
        int order = 0;
        for (int questionId : new int[] { questionI1, i2, i3, questionV3 }) {
            placements.append(order == 0 ? "" : ",")
                    .append("{\"questionId\":").append(questionId)
                    .append(",\"sectionId\":null,\"sortOrder\":").append(++order).append("}");
        }
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placements.append("]").toString()))
                .andExpect(status().isOk());

        assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":" + s(unique + " assessment") + ",\"questionnaireId\":" + questionnaireId
                        + ",\"showTermsAndConditions\":false,\"status\":\"ACTIVE\","
                        + "\"autoNext\":false}"), "$.assessmentId");
    }

    /* ===================== preview ===================== */

    @Test
    void anonymousIsRefused() throws Exception {
        mvc.perform(post("/api/report-item-bindings/import/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(fourItems(), null)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void matchesEveryItemToItsOwnQuestionByStatement() throws Exception {
        preview(fourItems())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(4))
                .andExpect(jsonPath("$.blocking.length()").value(0))
                .andExpect(jsonPath("$.rows[*].matchMethod",
                        Matchers.everyItem(Matchers.is("EXACT"))))
                .andExpect(jsonPath("$.rows[0].itemCode").value("I1"))
                .andExpect(jsonPath("$.rows[0].questionId").value(questionI1))
                .andExpect(jsonPath("$.rows[3].itemCode").value("V3"))
                .andExpect(jsonPath("$.rows[3].questionId").value(questionV3))
                // The PLACEMENT, not just the question. A bank question can be
                // placed in many questionnaires; §7's presentation-order lint
                // needs the row that carries this one's sortOrder.
                .andExpect(jsonPath("$.rows[*].questionnaireQuestionId",
                        Matchers.everyItem(Matchers.notNullValue())));
    }

    /**
     * The headline claim: "Self-Efficacy" exists under two qualities, and the
     * Factor column is what says which one an item means.
     */
    @Test
    void resolvesADuplicatedConstructNameByTheFactorBesideIt() throws Exception {
        preview(fourItems())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].mqtId").value(driveSelfEfficacy))
                .andExpect(jsonPath("$.rows[0].mqtPath",
                        Matchers.containsString("Self-Efficacy")))
                .andExpect(jsonPath("$.rows[3].mqtId").value(validitySelfEfficacy));
    }

    @Test
    void carriesTheReverseAndCompositeFlagsThrough() throws Exception {
        preview(fourItems())
                .andExpect(jsonPath("$.rows[2].itemCode").value("I3"))
                .andExpect(jsonPath("$.rows[2].reverseScored").value(true))
                .andExpect(jsonPath("$.rows[3].itemCode").value("V3"))
                .andExpect(jsonPath("$.rows[3].inComposite").value(false))
                .andExpect(jsonPath("$.rows[0].inComposite").value(true));
    }

    /**
     * All or nothing. A partially bound sheet is worse than none: it produces
     * rules that look translated and quietly leave an item out of a sum.
     */
    @Test
    void refusesTheWholeSheetWhenOneItemCannotBeMatched() throws Exception {
        String sheet = fourItems() + row("I9", "5", driveFactor, "Self-Efficacy",
                "A statement that is nowhere in this questionnaire at all.", "N", "Y");

        preview(sheet)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocking[0]",
                        Matchers.containsString("1 of 5 items could not be matched")));

        mvc.perform(post("/api/report-item-bindings/import")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(sheet, null)))
                .andExpect(status().isConflict());
    }

    @Test
    void aReviewersManualChoiceResolvesWhatTheMatcherCouldNot() throws Exception {
        String sheet = header()
                + row("I1", "1", driveFactor, "Self-Efficacy",
                        "Wording that does not resemble any question here.", "N", "Y");

        mvc.perform(post("/api/report-item-bindings/import/preview")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(sheet, "{\"I1\":" + questionI1 + "}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocking.length()").value(0))
                .andExpect(jsonPath("$.rows[0].matchMethod").value("MANUAL"))
                .andExpect(jsonPath("$.rows[0].questionId").value(questionI1));
    }

    @Test
    void offersEveryPlacedQuestionForThePicker() throws Exception {
        preview(fourItems())
                .andExpect(jsonPath("$.candidates.length()").value(4))
                .andExpect(jsonPath("$.candidates[0].stem", Matchers.containsString("totally new")));
    }

    /* ===================== import and re-import ===================== */

    @Test
    void importsAllFourAndReadsThemBack() throws Exception {
        importSheet(fourItems())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4));

        mvc.perform(get("/api/report-item-bindings/getByAssessment/" + assessmentId)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].itemCode").value("I1"))
                .andExpect(jsonPath("$[0].questionId").value(questionI1));
    }

    /**
     * Re-import is an in-place update, so importing the same sheet twice must
     * leave four bindings and not eight. The unique key would refuse the
     * duplicate anyway; what this pins is that the service UPDATES rather than
     * failing.
     */
    @Test
    void reimportingTheSameSheetChangesNothing() throws Exception {
        importSheet(fourItems()).andExpect(status().isOk());

        preview(fourItems())
                .andExpect(jsonPath("$.rows[*].change",
                        Matchers.everyItem(Matchers.is("UNCHANGED"))))
                .andExpect(jsonPath("$.removed.length()").value(0));

        importSheet(fourItems()).andExpect(jsonPath("$.length()").value(4));
        mvc.perform(get("/api/report-item-bindings/getByAssessment/" + assessmentId)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(jsonPath("$.length()").value(4));
    }

    @Test
    void reportsAFlagChangeSeparatelyFromEverythingElse() throws Exception {
        importSheet(fourItems()).andExpect(status().isOk());

        // I3 stops being reverse scored — which changes what every score
        // reading it means, and is the reason flags get their own change kind.
        preview(fourItems().replace(
                row("I3", "3", driveFactor, "Self-Efficacy", I3, "Y", "Y"),
                row("I3", "3", driveFactor, "Self-Efficacy", I3, "N", "Y")))
                .andExpect(jsonPath("$.rows[2].change").value("FLAGS_CHANGED"))
                .andExpect(jsonPath("$.rows[0].change").value("UNCHANGED"));
    }

    @Test
    void namesTheItemsADroppedSheetWouldDelete() throws Exception {
        importSheet(fourItems()).andExpect(status().isOk());

        preview(fourItems().replace(
                row("V3", "4", validityFactor, "Self-Efficacy", V3, "N", "N"), ""))
                .andExpect(jsonPath("$.rows.length()").value(3))
                .andExpect(jsonPath("$.removed.length()").value(1))
                .andExpect(jsonPath("$.removed[0]").value("V3"));
    }

    /**
     * Deleting an item a rule still names is refused.
     *
     * <p>The sheet is the authority on which items exist, so a code it no
     * longer carries is deleted — but a rule whose text still says {@code V3}
     * would then name nothing and silently stop being translatable. Which of
     * the two is out of date is a question for a person.
     */
    @Test
    void refusesToDeleteAnItemARuleStillNames() throws Exception {
        importSheet(fourItems()).andExpect(status().isOk());

        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ infrequency " + System.nanoTime() + "\","
                                + "\"stage\":\"VALIDITY\",\"stepOrder\":1,"
                                + "\"definitionKind\":\"STATEMENT\","
                                + "\"statementText\":\"IF V3 <= 3 THEN protocol_status = 'INVALID'\","
                                + "\"assessmentId\":" + assessmentId + "}"))
                .andExpect(status().isOk());

        preview(fourItems().replace(
                row("V3", "4", validityFactor, "Self-Efficacy", V3, "N", "N"), ""))
                .andExpect(jsonPath("$.blocking",
                        Matchers.hasItem(Matchers.containsString("still names it"))));
    }

    /* ===================== helpers ===================== */

    private static String header() {
        return "Item_ID,Admin_Position,Factor,Construct,Statement,Reverse_Scored,In_Composite\n";
    }

    private static String row(String code, String position, String factor, String construct,
            String statement, String reverse, String inComposite) {
        return code + "," + position + "," + csv(factor) + "," + construct + ","
                + csv(statement) + "," + reverse + "," + inComposite + "\n";
    }

    /** Every interesting statement contains a comma, so quoting is not optional. */
    private static String csv(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private String fourItems() {
        return header()
                + row("I1", "1", driveFactor, "Self-Efficacy", I1, "N", "Y")
                + row("I2", "2", driveFactor, "Self-Efficacy", I2, "N", "Y")
                + row("I3", "3", driveFactor, "Self-Efficacy", I3, "Y", "Y")
                + row("V3", "4", validityFactor, "Self-Efficacy", V3, "N", "N");
    }

    private String body(String csv, String overrides) throws Exception {
        return "{\"csv\":" + JSON.writeValueAsString(csv)
                + ",\"assessmentId\":" + assessmentId
                + (overrides == null ? "" : ",\"questionOverrides\":" + overrides) + "}";
    }

    private org.springframework.test.web.servlet.ResultActions preview(String csv)
            throws Exception {
        return mvc.perform(post("/api/report-item-bindings/import/preview")
                .header(HttpHeaders.AUTHORIZATION, auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(csv, null)));
    }

    private org.springframework.test.web.servlet.ResultActions importSheet(String csv)
            throws Exception {
        return mvc.perform(post("/api/report-item-bindings/import")
                .header(HttpHeaders.AUTHORIZATION, auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(csv, null)));
    }

    private int mqt(int measuredQualityId, String name) throws Exception {
        return JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + measuredQualityId + ",\"parentTypeId\":null,"
                        + "\"name\":" + s(name) + "}"), "$.measuredQualityTypeId");
    }

    /** A five-point Likert item scoring one trait, exactly as the bank stores one. */
    private String likertItem(String stem, int mqtId) throws Exception {
        StringBuilder options = new StringBuilder();
        for (int point = 1; point <= 5; point++) {
            options.append(point == 1 ? "" : ",")
                    .append("{\"optionText\":\"").append(point).append("\",")
                    .append("\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[")
                    .append("{\"measuredQualityTypeId\":").append(mqtId)
                    .append(",\"score\":").append(point).append("}]}");
        }
        return postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":" + s(stem) + ",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":[" + options + "],\"mqtScores\":[]}");
    }

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static String s(String value) throws Exception {
        return JSON.writeValueAsString(value);
    }

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + (String) JsonPath.read(body, "$.token");
    }
}
