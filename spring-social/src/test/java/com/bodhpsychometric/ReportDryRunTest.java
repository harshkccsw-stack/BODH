package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * The rule pipeline, evaluated over real respondents with no AI and no sandbox.
 *
 * <h2>The fixture is a real instrument, with a real worked answer</h2>
 *
 * <p>This builds the <b>Internal Drive</b> factor of the psychometrician's
 * Academic Drive workbook, item for item, together with its Infrequency
 * validity item — and answers it with the exact raw responses from the
 * workbook's Sample_Calculator tab, whose hand-computed total is
 * <b>Internal Drive = 16</b>. That number is not one this test invented, which
 * is the entire reason it is worth asserting: a test that checks the code
 * against itself proves the code ran, and nothing else.
 *
 * <pre>
 *   I1  "I am sure I can learn what it needs"        raw 4  →  4
 *   I2  "regular practice can make me really good"   raw 5  →  5
 *   I3  REVERSE "a sign I am just not built for it"  raw 2  →  4   (6 - 2)
 *   I4  "heavy workloads do not shake my belief"     raw 3  →  3
 *                                                            ────
 *                                              Internal Drive  16
 * </pre>
 *
 * <h2>Reverse scoring is authored, not computed here</h2>
 *
 * <p>I3 is not transformed by any rule. Its options carry 5,4,3,2,1 instead of
 * 1,2,3,4,5, so picking "2" scores 4 by construction. That is the whole
 * mechanism, and it is deliberate: {@code MqtScoringService} sums
 * {@code OptionMqtScore}, so a reverse applied at report time would make
 * {@code mqt:} mean one thing in a Data Studio sheet and another in a report —
 * two sources of truth for one score, diverging silently. The report layer
 * never applies {@code 6 - raw}.
 *
 * <h2>What is being proved</h2>
 *
 * <ol>
 *   <li>the chain evaluates in dependency order, factor before band;</li>
 *   <li>{@code [rule:slug]} resolves to the referenced rule's value, per row;</li>
 *   <li>a validity item excluded from the composite really is excluded — it
 *       lives under its own quality and cannot leak in;</li>
 *   <li>{@code is_population} propagates along the DAG, and NORMBAND alone does
 *       not set it;</li>
 *   <li>summaries cover the whole cohort — the band histogram is what catches a
 *       cut written backwards.</li>
 * </ol>
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportDryRunTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + (String) JsonPath.read(body, "$.token");
    }

    /**
     * One five-point Likert item scoring a single trait.
     *
     * @param reversed when true the options score 5..1 instead of 1..5 — the
     *        product's way of expressing a reverse-keyed item, applied once at
     *        authoring rather than every time anything reads the score
     */
    private String likertItem(String stem, int mqtId, boolean reversed) throws Exception {
        StringBuilder options = new StringBuilder();
        for (int point = 1; point <= 5; point++) {
            int score = reversed ? 6 - point : point;
            options.append(point == 1 ? "" : ",")
                    .append("{\"optionText\":\"").append(point).append("\",")
                    .append("\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[")
                    .append("{\"measuredQualityTypeId\":").append(mqtId)
                    .append(",\"score\":").append(score).append("}]}");
        }
        return postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":[" + options + "],\"mqtScores\":[]}");
    }

    private String rule(String json) throws Exception {
        return mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void theWorkbookFactorBandsAndValidityCheckComputeOverARealCohort() throws Exception {
        // ── Taxonomy ──────────────────────────────────────────────────────
        // Two qualities, and that is load-bearing. Validity items live under
        // their OWN quality, which is how "In_Composite = N" stops being a rule
        // somebody has to remember and becomes arithmetic: a trait under a
        // different MQ cannot appear in this MQ's total.
        int driveMq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Academic Drive\",\"description\":null}"),
                "$.measuredQualityId");
        int internalDrive = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + driveMq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Internal Drive\"}"), "$.measuredQualityTypeId");

        int validityMq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Validity\",\"description\":null}"),
                "$.measuredQualityId");
        int infrequency = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + validityMq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Infrequency\"}"), "$.measuredQualityTypeId");

        // ── Items ─────────────────────────────────────────────────────────
        String i1 = likertItem("__smoke__ I1 sure I can learn what it needs", internalDrive, false);
        String i2 = likertItem("__smoke__ I2 practice makes me good at them", internalDrive, false);
        String i3 = likertItem("__smoke__ I3 a sign I am not built for it", internalDrive, true);
        String i4 = likertItem("__smoke__ I4 workloads do not shake my belief", internalDrive, false);
        String v3 = likertItem("__smoke__ V3 attended a class in the past year", infrequency, false);

        // ── Delivery chain ────────────────────────────────────────────────
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Academic Drive QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");

        StringBuilder placements = new StringBuilder("[");
        int order = 0;
        for (String item : new String[] { i1, i2, i3, i4, v3 }) {
            placements.append(order == 0 ? "" : ",")
                    .append("{\"questionId\":").append((int) JsonPath.read(item, "$.questionId"))
                    .append(",\"sectionId\":null,\"sortOrder\":").append(++order).append("}");
        }
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placements.append("]").toString()))
                .andExpect(status().isOk());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Academic Drive\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");

        // ── Three respondents ─────────────────────────────────────────────
        // The first is the workbook's own Sample_Calculator column. The other
        // two exist so that the cohort has a distribution to summarise and a
        // z-score that is not degenerate — with one respondent sd is 0 and
        // every z-score comes back exactly 0, which looks identical to
        // perfectly average.
        submit(assessmentId, "drive.one@test.local", new int[] { 4, 5, 2, 3, 5 }, i1, i2, i3, i4, v3);
        submit(assessmentId, "drive.two@test.local", new int[] { 2, 2, 4, 2, 5 }, i1, i2, i3, i4, v3);
        submit(assessmentId, "drive.three@test.local", new int[] { 3, 3, 3, 3, 2 }, i1, i2, i3, i4, v3);

        // ── The rules, as the six-step pipeline would file them ───────────
        rule("""
                {"name":"__smoke__ Internal Drive","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]",
                 "assessmentId":%d}""".formatted(internalDrive, assessmentId));

        // Step 4 reads step 3's output. NORMBAND tests strictly-less-than, so
        // the workbook's "<= 9 Developing, 10-14 Moderate, >= 15 High" is
        // written with its cuts at 10 and 15 — writing 9 and 14 would put every
        // respondent on a boundary in the wrong band, silently.
        rule("""
                {"name":"__smoke__ Drive band","stage":"BAND","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"NORMBAND([rule:smoke-internal-drive], 10, 'Developing', 15, 'Moderate', 'High')",
                 "assessmentId":%d}""".formatted(assessmentId));

        rule("""
                {"name":"__smoke__ Infrequency check","stage":"VALIDITY","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"IF([mqt:%d] <= 3, 'INVALID', 'OK')",
                 "assessmentId":%d}""".formatted(infrequency, assessmentId));

        rule("""
                {"name":"__smoke__ Drive vs cohort","stage":"SCORE","stepOrder":2,
                 "definitionKind":"EXPRESSION","expression":"ZSCORE([rule:smoke-internal-drive])",
                 "assessmentId":%d}""".formatted(assessmentId));

        rule("""
                {"name":"__smoke__ Cohort band","stage":"BAND","stepOrder":2,
                 "definitionKind":"EXPRESSION",
                 "expression":"NORMBAND([rule:smoke-drive-vs-cohort], 0, 'Below average', 'At or above')",
                 "assessmentId":%d}""".formatted(assessmentId));

        // A composite: SUM over one respondent's OWN columns.
        //
        // This is the shape that was silently wrong. SUM used to be a cohort
        // aggregate — it returned the population total of its FIRST argument
        // and discarded the rest — so this rule would have read 36 (16+8+12,
        // the cohort total of the factor) for all three respondents alike.
        // The three distinct answers below are the whole proof.
        rule("""
                {"name":"__smoke__ Composite","stage":"SCORE","stepOrder":3,
                 "definitionKind":"EXPRESSION",
                 "expression":"SUM([rule:smoke-internal-drive], [mqt:%d])",
                 "assessmentId":%d}""".formatted(infrequency, assessmentId));

        // ── A threshold the instrument cannot produce ─────────────────────
        // Four 1-5 items feed Internal Drive, so it runs 4-20. A band cut of 48
        // belongs to the 12-60 composite and is simply never met here. The
        // formula is VALID - it parses, the column exists, it would save and
        // run - and it bands nobody. That gap between "valid" and "right" is
        // the whole reason the warning exists, so ok must stay true.
        String verdict = mvc.perform(post("/api/report-rules/validate-expression")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessmentId
                                + ",\"expression\":\"IF([mqt:" + internalDrive
                                + "] >= 48, 'High Drive', '')\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertTrue(
                verdict.contains("\"warnings\""), () -> "no warnings field: " + verdict);
        org.junit.jupiter.api.Assertions.assertTrue(
                JsonPath.<List<String>>read(verdict, "$.warnings").stream()
                        .anyMatch(w -> w.contains("20") && w.contains("48")),
                () -> "expected the ceiling and the cut to be named: "
                        + JsonPath.read(verdict, "$.warnings"));

        // The same cut against the whole quality, which four items can still
        // only take to 20 - and the reachable version, which says nothing.
        org.junit.jupiter.api.Assertions.assertTrue(
                JsonPath.<List<String>>read(mvc.perform(post("/api/report-rules/validate-expression")
                                .header(HttpHeaders.AUTHORIZATION, auth())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"assessmentId\":" + assessmentId
                                        + ",\"expression\":\"IF([mqt:" + internalDrive
                                        + "] >= 15, 'High Drive', '')\"}"))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString(), "$.warnings").isEmpty(),
                "a cut inside the range must not warn");

        // ── The dry run ───────────────────────────────────────────────────
        String out = mvc.perform(post("/api/report-rules/dry-run")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessmentId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.respondentCount").value(3))
                .andReturn().getResponse().getContentAsString();

        // Dependency order, not the order they were written: a band cannot be
        // evaluated before the factor it reads.
        int factorAt = indexOfRule(out, "smoke-internal-drive");
        int bandAt = indexOfRule(out, "smoke-drive-band");
        int zAt = indexOfRule(out, "smoke-drive-vs-cohort");
        int cohortBandAt = indexOfRule(out, "smoke-cohort-band");
        org.junit.jupiter.api.Assertions.assertTrue(factorAt < bandAt,
                "the factor must be evaluated before the band that reads it");
        org.junit.jupiter.api.Assertions.assertTrue(zAt < cohortBandAt,
                "the z-score must be evaluated before the band that reads it");

        // THE number: the workbook's own worked answer for its own responses.
        org.junit.jupiter.api.Assertions.assertEquals(16.0,
                (double) rowValue(out, "drive.one", "smoke-internal-drive"), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals("High",
                rowValue(out, "drive.one", "smoke-drive-band"));

        // 2 + 2 + (6-4) + 2 = 8, below the first cut.
        org.junit.jupiter.api.Assertions.assertEquals(8.0,
                (double) rowValue(out, "drive.two", "smoke-internal-drive"), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals("Developing",
                rowValue(out, "drive.two", "smoke-drive-band"));

        // 3 + 3 + 3 + 3 = 12, and V3 = 2 fails the infrequency check. That the
        // validity item scores 2 while the factor still reads 12 is the proof
        // that a separate quality keeps it out of the composite.
        org.junit.jupiter.api.Assertions.assertEquals(12.0,
                (double) rowValue(out, "drive.three", "smoke-internal-drive"), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals("Moderate",
                rowValue(out, "drive.three", "smoke-drive-band"));
        org.junit.jupiter.api.Assertions.assertEquals("INVALID",
                rowValue(out, "drive.three", "smoke-infrequency-check"));
        org.junit.jupiter.api.Assertions.assertEquals("OK",
                rowValue(out, "drive.one", "smoke-infrequency-check"));

        // The composite, per respondent: factor + validity item, three
        // different numbers. 16+5, 8+5, 12+2 — and not one shared 36.
        org.junit.jupiter.api.Assertions.assertEquals(21.0,
                (double) rowValue(out, "drive.one", "smoke-composite"), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals(13.0,
                (double) rowValue(out, "drive.two", "smoke-composite"), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals(14.0,
                (double) rowValue(out, "drive.three", "smoke-composite"), 0.0001);

        // The cohort view — the only one that shows a band cut written
        // backwards. 8, 12, 16: mean 12, and one respondent in each band.
        org.junit.jupiter.api.Assertions.assertEquals(8.0,
                num(ruleField(out, "smoke-internal-drive", "summary.min")), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals(16.0,
                num(ruleField(out, "smoke-internal-drive", "summary.max")), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals(12.0,
                num(ruleField(out, "smoke-internal-drive", "summary.mean")), 0.0001);
        org.junit.jupiter.api.Assertions.assertEquals(0.0,
                num(ruleField(out, "smoke-internal-drive", "summary.nulls")), 0.0001);
        for (String band : new String[] { "Developing", "Moderate", "High" }) {
            org.junit.jupiter.api.Assertions.assertEquals(1.0,
                    num(ruleField(out, "smoke-drive-band", "summary.bands['" + band + "']")), 0.0001,
                    band + " should hold exactly one respondent");
        }

        // Every rule ran; nothing fell back to a null-filled column. Data
        // Studio's sheet compute writes null and carries on, which is right for
        // a spreadsheet and wrong here — a null score is a wrong report.
        for (String slug : new String[] { "smoke-internal-drive", "smoke-drive-band",
                "smoke-infrequency-check", "smoke-drive-vs-cohort", "smoke-cohort-band",
                "smoke-composite" }) {
            org.junit.jupiter.api.Assertions.assertEquals("EVALUATED",
                    ruleField(out, slug, "status"), slug + " should have evaluated");
        }

        // ── is_population, which arms the minimum-cohort guard ────────────
        // NORMBAND alone does NOT make a rule cohort-relative: its evaluator
        // reads cut points and the current row. Were it treated as population
        // — as Data Studio's CLIENT/SERVER hint would have it — every band in
        // the product would be suppressed below the minimum cohort size.
        org.junit.jupiter.api.Assertions.assertEquals(false,
                ruleField(out, "smoke-internal-drive", "population"));
        org.junit.jupiter.api.Assertions.assertEquals(false,
                ruleField(out, "smoke-drive-band", "population"));
        // Nor does SUM: a composite of a respondent's own columns needs nobody
        // else's row, and flagging it would suppress it below the minimum
        // cohort size for no reason.
        org.junit.jupiter.api.Assertions.assertEquals(false,
                ruleField(out, "smoke-composite", "population"));
        // ZSCORE does, and it carries down the chain: a band reading a
        // cohort-relative score is itself cohort-relative.
        org.junit.jupiter.api.Assertions.assertEquals(true,
                ruleField(out, "smoke-drive-vs-cohort", "population"));
        org.junit.jupiter.api.Assertions.assertEquals(true,
                ruleField(out, "smoke-cohort-band", "population"));
    }

    // ── portability across assessments ────────────────────────────────────

    /**
     * A rule travels when its columns exist at the destination — and warns when
     * they exist but do not <b>mean</b> the same thing.
     *
     * <p>The second half is the case worth having. {@code mqt:14} is a global
     * taxonomy id, so a trait is the same trait everywhere; it is not the same
     * NUMBER everywhere. Two items feeding it gives a range of 2–10, four gives
     * 4–20, and a rule carrying a cut at 8 moves from "top of the scale" to
     * "middle" without a single validation failing. Nothing else in the system
     * notices.
     */
    @Test
    void aRuleWarnsWhenItsTraitHasADifferentRangeOnTheTargetAssessment() throws Exception {
        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Portability\",\"description\":null}"),
                "$.measuredQualityId");
        int shared = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Shared trait\"}"), "$.measuredQualityTypeId");
        int onlyHere = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Local trait\"}"), "$.measuredQualityTypeId");

        // Small: two items on the shared trait (max 10), plus one on a trait
        // the other assessment does not carry at all.
        int small = assessmentOf("__smoke__ small", new String[] {
                likertItem("__smoke__ S1", shared, false),
                likertItem("__smoke__ S2", shared, false),
                likertItem("__smoke__ S3", onlyHere, false) });

        // Large: four items on the same shared trait (max 20).
        int large = assessmentOf("__smoke__ large", new String[] {
                likertItem("__smoke__ L1", shared, false),
                likertItem("__smoke__ L2", shared, false),
                likertItem("__smoke__ L3", shared, false),
                likertItem("__smoke__ L4", shared, false) });

        rule("""
                {"name":"__smoke__ Shared score","stage":"SCORE",
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]",
                 "assessmentId":%d}""".formatted(shared, small));
        rule("""
                {"name":"__smoke__ Local score","stage":"SCORE",
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]",
                 "assessmentId":%d}""".formatted(onlyHere, small));
        // Reads nothing but another rule. Its own referenced columns are empty,
        // so a check that stopped at direct references would call it portable
        // anywhere — including onto an assessment that cannot compute the score
        // it rests on.
        rule("""
                {"name":"__smoke__ Local band","stage":"BAND",
                 "definitionKind":"EXPRESSION",
                 "expression":"NORMBAND([rule:smoke-local-score], 3, 'Low', 'High')",
                 "assessmentId":%d}""".formatted(small));

        String onLarge = mvc.perform(org.springframework.test.web.servlet.request
                        .MockMvcRequestBuilders
                        .get("/api/report-rules/portability/getByAssessment/" + large)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Same key, different instrument: every column resolves, so this is not
        // blocked — it is warned about, by name, with both ranges quoted.
        org.junit.jupiter.api.Assertions.assertEquals("SHAPE_MISMATCH",
                entryField(onLarge, "smoke-shared-score", "verdict"));
        String warning = String.valueOf(
                ((java.util.List<?>) entryField(onLarge, "smoke-shared-score", "warnings")).get(0));
        org.junit.jupiter.api.Assertions.assertTrue(warning.contains("mqt:" + shared),
                "the warning must name the trait: " + warning);
        org.junit.jupiter.api.Assertions.assertTrue(
                warning.contains("4 questions") && warning.contains("max 20"),
                "the warning must quote the range here: " + warning);
        org.junit.jupiter.api.Assertions.assertTrue(
                warning.contains("by 2 (max 10)"),
                "the warning must quote the range it was written against: " + warning);

        // A column the target assessment does not score at all.
        org.junit.jupiter.api.Assertions.assertEquals("BLOCKED",
                entryField(onLarge, "smoke-local-score", "verdict"));
        org.junit.jupiter.api.Assertions.assertTrue(
                ((java.util.List<?>) entryField(onLarge, "smoke-local-score", "missingKeys"))
                        .contains("mqt:" + onlyHere),
                "a blocked rule must say which column is missing");

        // And the transitive case: the band names no column of its own.
        org.junit.jupiter.api.Assertions.assertEquals("BLOCKED",
                entryField(onLarge, "smoke-local-band", "verdict"));
        org.junit.jupiter.api.Assertions.assertTrue(
                ((java.util.List<?>) entryField(onLarge, "smoke-local-band", "dependencySlugs"))
                        .contains("smoke-local-score"),
                "adopting a rule must show what it drags along");

        // On its own assessment everything fits.
        String onSmall = mvc.perform(org.springframework.test.web.servlet.request
                        .MockMvcRequestBuilders
                        .get("/api/report-rules/portability/getByAssessment/" + small)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for (String slug : new String[] { "smoke-shared-score", "smoke-local-score",
                "smoke-local-band" }) {
            org.junit.jupiter.api.Assertions.assertEquals("PORTABLE",
                    entryField(onSmall, slug, "verdict"), slug + " fits its own assessment");
        }
    }

    @Test
    void portabilityForAMissingAssessmentIs404() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/report-rules/portability/getByAssessment/424242")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isNotFound());
    }

    // ── the DAG's refusals ────────────────────────────────────────────────

    @Test
    void aRuleReferencingItselfOrAnUnknownRuleIsRefused() throws Exception {
        // No assessment is needed to prove this: the reference is resolved
        // against the rules LIBRARY, and an unknown slug fails before any
        // column is looked at.
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ dangling","stage":"SCORE",
                                 "definitionKind":"EXPRESSION",
                                 "expression":"[rule:no-such-rule-anywhere] + 1",
                                 "assessmentId":424242}"""))
                .andExpect(status().isNotFound());
    }

    @Test
    void anUnknownStageIsRefused() throws Exception {
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ bad stage","stage":"STEP_SEVEN",
                                 "definitionKind":"STATEMENT","statementText":"anything"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aRuleWithNoStageIsFiledUnderScore() throws Exception {
        mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ unfiled rule","definitionKind":"STATEMENT",
                                 "statementText":"Written from the library page, which knows nothing of steps."}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("SCORE"));
    }

    @Test
    void theStagesAreServedInPipelineOrder() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/report-rules/stages")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0]").value("VALIDITY"))
                .andExpect(jsonPath("$[1]").value("SCORE"))
                .andExpect(jsonPath("$[2]").value("BAND"))
                .andExpect(jsonPath("$[3]").value("PROFILE"))
                .andExpect(jsonPath("$[4]").value("EDGE"));
    }

    @Test
    void aDryRunAgainstAMissingAssessmentIs404() throws Exception {
        mvc.perform(post("/api/report-rules/dry-run")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":424242}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void anonymousCannotDryRun() throws Exception {
        mvc.perform(post("/api/report-rules/dry-run")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":1}"))
                .andExpect(status().isUnauthorized());
    }

    // ── helpers ───────────────────────────────────────────────────────────

    /** A questionnaire holding exactly these items, and an assessment over it. */
    private int assessmentOf(String name, String[] items) throws Exception {
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"" + name + " QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"),
                "$.questionnaireId");
        StringBuilder placements = new StringBuilder("[");
        for (int i = 0; i < items.length; i++) {
            placements.append(i == 0 ? "" : ",")
                    .append("{\"questionId\":").append((int) JsonPath.read(items[i], "$.questionId"))
                    .append(",\"sectionId\":null,\"sortOrder\":").append(i + 1).append("}");
        }
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placements.append("]").toString()))
                .andExpect(status().isOk());
        return JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"" + name + "\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\","
                        + "\"autoNext\":false}"), "$.assessmentId");
    }

    /** Register, allot, begin and submit one attempt with the given raw points. */
    private void submit(int assessmentId, String email, int[] points, String... items)
            throws Exception {
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ " + email + "\",\"email\":\"" + email + "\","
                        + "\"dob\":\"07-07-2007\",\"phoneCountryCode\":\"+91\","
                        + "\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,"
                        + "\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":["
                        + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"2007-07-07\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId)
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        StringBuilder answers = new StringBuilder("[");
        for (int i = 0; i < items.length; i++) {
            // points[i] is the raw 1-5 response, and the options were created in
            // that order, so it indexes straight into them. A reverse-keyed item
            // differs only in what its option is WORTH.
            answers.append(i == 0 ? "" : ",")
                    .append("{\"questionId\":").append((int) JsonPath.read(items[i], "$.questionId"))
                    .append(",\"optionId\":")
                    .append((int) JsonPath.read(items[i], "$.options[" + (points[i] - 1) + "].optionId"))
                    .append("}");
        }
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId)
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":" + answers.append("]") + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));
    }

    /**
     * One field of one rule's outcome.
     *
     * <p>A JsonPath filter always yields an ARRAY, even when it matches exactly
     * one element, so the index has to happen here rather than in the path —
     * writing {@code [?(...)][0]} silently returns the array itself and the
     * cast fails somewhere far away from the mistake.
     */
    private static Object ruleField(String body, String slug, String field) {
        java.util.List<Object> found =
                JsonPath.read(body, "$.rules[?(@.slug=='" + slug + "')]." + field);
        if (found.isEmpty()) {
            throw new AssertionError("no rule " + slug + " in the dry run");
        }
        return found.get(0);
    }

    /**
     * The same lookup against a bare-array response — portability returns the
     * list itself, the dry run wraps it in an envelope.
     */
    private static Object entryField(String body, String slug, String field) {
        java.util.List<Object> found =
                JsonPath.read(body, "$[?(@.slug=='" + slug + "')]." + field);
        if (found.isEmpty()) {
            throw new AssertionError("no rule " + slug + " in the portability list");
        }
        return found.get(0);
    }

    private static double num(Object value) {
        return ((Number) value).doubleValue();
    }

    private static int indexOfRule(String body, String slug) {
        java.util.List<String> slugs = JsonPath.read(body, "$.rules[*].slug");
        return slugs.indexOf(slug);
    }

    private static Object rowValue(String body, String emailPrefix, String slug) {
        java.util.List<java.util.Map<String, Object>> rows = JsonPath.read(body, "$.rows");
        for (java.util.Map<String, Object> row : rows) {
            if (String.valueOf(row.get("label")).contains(emailPrefix)) {
                @SuppressWarnings("unchecked")
                java.util.Map<String, Object> values =
                        (java.util.Map<String, Object>) row.get("values");
                Object value = values.get(slug);
                return value instanceof Integer i ? (double) i : value;
            }
        }
        throw new AssertionError("no row for " + emailPrefix);
    }
}
