package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;
import com.bodhpsychometric.repository.measures.MeasuredQualityRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityTypeRepository;
import com.jayway.jsonpath.JsonPath;

/**
 * Importing questions together with the qualities they need.
 *
 * <h2>What this is proving</h2>
 *
 * Mostly one thing: <b>that a failed import leaves nothing behind</b>. The
 * endpoint exists for that and nothing else — creating qualities through the
 * taxonomy endpoints and then posting questions works perfectly well right up
 * until the last call fails, and the only visible difference is the wreckage
 * afterwards. Wreckage is invisible in a passing test suite, so it is asserted
 * here directly: count the qualities, fail an import, count them again.
 *
 * <p>The second claim is quieter and just as easy to get wrong: several roots
 * created under one new quality in a single transaction must come out with
 * distinct sort orders. Reading the sibling count off a collection that the
 * new siblings were never added to gives every one of them zero.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionImportTest {

    @Autowired private MockMvc mvc;
    @Autowired private MeasuredQualityRepository qualities;
    @Autowired private MeasuredQualityTypeRepository types;

    private String tag;

    @BeforeEach
    void unique() {
        tag = "__smoke__" + System.nanoTime();
    }

    /* ===================== the happy path ===================== */

    @Test
    void createsQualitiesTypesAndQuestionsInOneCall() throws Exception {
        String body = """
                {
                  "newQualities": [{"ref": -1, "name": "%s Drive", "description": null}],
                  "newQualityTypes": [
                    {"ref": -11, "name": "%s Perseverance", "qualityRef": -1},
                    {"ref": -12, "name": "%s Deep Focus", "parentTypeRef": -11}
                  ],
                  "questions": [
                    {"stem": "%s I keep going.", "options": [
                       {"optionText": "Never", "mqtScores": [{"measuredQualityTypeId": -11, "score": 1}]},
                       {"optionText": "Always", "mqtScores": [{"measuredQualityTypeId": -12, "score": 5}]}
                     ]}
                  ]
                }
                """.formatted(tag, tag, tag, tag);

        String out = mvc.perform(post("/api/questions/import")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        assertEquals(1, ((List<?>) JsonPath.read(out, "$.questions")).size());
        int perseverance = JsonPath.read(out, "$.createdQualityTypeIds['-11']");
        int deepFocus = JsonPath.read(out, "$.createdQualityTypeIds['-12']");

        // The pending ids in the question became the real ones, and the nested
        // type really was parented to the one above it.
        MeasuredQualityType child = types.findById((long) deepFocus).orElseThrow();
        assertEquals(perseverance, child.getParent().getMeasuredQualityTypeId());
        int createdMq = JsonPath.read(out, "$.createdQualityIds['-1']");
        assertEquals(createdMq, child.getMeasuredQuality().getMeasuredQualityId().intValue());
    }

    @Test
    void severalRootsUnderOneNewQualityGetDistinctSortOrders() throws Exception {
        String body = """
                {
                  "newQualities": [{"ref": -1, "name": "%s Drive"}],
                  "newQualityTypes": [
                    {"ref": -11, "name": "%s One", "qualityRef": -1},
                    {"ref": -12, "name": "%s Two", "qualityRef": -1},
                    {"ref": -13, "name": "%s Three", "qualityRef": -1}
                  ],
                  "questions": [{"stem": "%s Anything?", "options": [
                     {"optionText": "Yes", "mqtScores": [{"measuredQualityTypeId": -11, "score": 1}]},
                     {"optionText": "No", "mqtScores": []}]}]
                }
                """.formatted(tag, tag, tag, tag, tag);

        String out = mvc.perform(post("/api/questions/import")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        // All three would be 0 if the sibling count were read off a collection
        // the new siblings never joined — which is what the taxonomy endpoint
        // does, correctly, because it only ever creates one at a time.
        assertEquals(0, sortOrderOf(out, "-11"));
        assertEquals(1, sortOrderOf(out, "-12"));
        assertEquals(2, sortOrderOf(out, "-13"));
    }

    /* ===================== the point of the endpoint ===================== */

    @Test
    void aFailedImportLeavesNoQualitiesBehind() throws Exception {
        long before = qualities.count();
        long typesBefore = types.count();

        // Passes every check that can be made without writing: the refs line
        // up, the questions are well formed. It fails in the LAST phase, on a
        // real-looking MQT id that does not exist — which is exactly when the
        // qualities have already been created.
        String body = """
                {
                  "newQualities": [{"ref": -1, "name": "%s Ghost"}],
                  "newQualityTypes": [{"ref": -11, "name": "%s Phantom", "qualityRef": -1}],
                  "questions": [{"stem": "%s Does this survive?", "options": [
                     {"optionText": "Yes", "mqtScores": [{"measuredQualityTypeId": 999999999, "score": 1}]},
                     {"optionText": "No", "mqtScores": []}]}]
                }
                """.formatted(tag, tag, tag);

        mvc.perform(post("/api/questions/import")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());

        // The whole reason this endpoint exists. A returned 400 in place of a
        // thrown one would leave both of these one higher, and every other
        // assertion in this file would still pass.
        assertEquals(before, qualities.count(), "a failed import created a measured quality");
        assertEquals(typesBefore, types.count(), "a failed import created a quality type");
    }

    @Test
    void aDuplicateSiblingNameIsRefusedAndWritesNothing() throws Exception {
        String name = tag + " Drive";
        mvc.perform(post("/api/qualities/create").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\"}")).andExpect(status().isCreated());

        long before = qualities.count();
        String body = """
                {
                  "newQualities": [{"ref": -1, "name": "%s"}],
                  "newQualityTypes": [],
                  "questions": [{"stem": "%s q", "options": [
                     {"optionText": "a", "mqtScores": []}, {"optionText": "b", "mqtScores": []}]}]
                }
                """.formatted(name, tag);

        mvc.perform(post("/api/questions/import")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());

        assertEquals(before, qualities.count());
    }

    /* ===================== refused before anything is written ===================== */

    @Test
    void aPendingIdThePayloadDoesNotCreateIsRefused() throws Exception {
        long before = qualities.count();
        String body = """
                {
                  "newQualities": [{"ref": -1, "name": "%s Drive"}],
                  "newQualityTypes": [],
                  "questions": [{"stem": "%s q", "options": [
                     {"optionText": "a", "mqtScores": [{"measuredQualityTypeId": -99, "score": 1}]},
                     {"optionText": "b", "mqtScores": []}]}]
                }
                """.formatted(tag, tag);

        mvc.perform(post("/api/questions/import")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());

        assertEquals(before, qualities.count());
    }

    @Test
    void typesThatReferenceEachOtherInALoopAreRefused() throws Exception {
        String body = """
                {
                  "newQualityTypes": [
                    {"ref": -11, "name": "%s A", "parentTypeRef": -12},
                    {"ref": -12, "name": "%s B", "parentTypeRef": -11}
                  ],
                  "questions": [{"stem": "%s q", "options": [
                     {"optionText": "a", "mqtScores": []}, {"optionText": "b", "mqtScores": []}]}]
                }
                """.formatted(tag, tag, tag);

        String out = mvc.perform(post("/api/questions/import")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();

        assertTrue(((String) JsonPath.read(out, "$.message")).contains("loop"), out);
    }

    @Test
    void aTypeWithTwoParentsIsRefused() throws Exception {
        String body = """
                {
                  "newQualities": [{"ref": -1, "name": "%s Drive"}],
                  "newQualityTypes": [{"ref": -11, "name": "%s A", "qualityRef": -1, "parentTypeRef": -11}],
                  "questions": [{"stem": "%s q", "options": [
                     {"optionText": "a", "mqtScores": []}, {"optionText": "b", "mqtScores": []}]}]
                }
                """.formatted(tag, tag, tag);

        mvc.perform(post("/api/questions/import")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }

    /* ===================== the sentinel is inert elsewhere ===================== */

    @Test
    void aPendingIdMeansNothingToBulkCreate() throws Exception {
        String body = """
                [{"stem": "%s q", "options": [
                   {"optionText": "a", "mqtScores": [{"measuredQualityTypeId": -11, "score": 1}]},
                   {"optionText": "b", "mqtScores": []}]}]
                """.formatted(tag);

        // Negative ids are a convention of ONE endpoint. Anywhere else they are
        // simply an id that does not exist, which is already an error.
        mvc.perform(post("/api/questions/bulk-create")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }

    /* ===================== the AI route's own gate ===================== */

    @Test
    void theSheetMapperSaysWhetherItIsConfigured() throws Exception {
        // Asked before the button is drawn; an install with no key must answer
        // rather than fail, so the template route can be offered alone.
        mvc.perform(get("/api/questions/ai/available")).andExpect(status().isOk());
    }

    @Test
    void mappingASheetRequiresASession() throws Exception {
        // Every other question endpoint is still open, and this one is not:
        // it spends money on each call, so it checks now rather than waiting
        // for the security pass the rest are owed.
        mvc.perform(post("/api/questions/ai/map-sheet")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sheets\":[{\"name\":\"Sheet1\",\"csv\":\"a,b\"}]}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anUnconfiguredServerSaysSoInsteadOfFailingMidCall() throws Exception {
        // No OPENAI_API_KEY in the test environment, which is the same state a
        // fresh install is in. The answer has to name the template route, or
        // the user is left at a dead end.
        String out = mvc.perform(post("/api/questions/ai/map-sheet")
                        .header(org.springframework.http.HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sheets\":[{\"name\":\"Sheet1\",\"csv\":\"a,b\"}]}"))
                .andExpect(status().isServiceUnavailable())
                .andReturn().getResponse().getContentAsString();
        assertTrue(((String) JsonPath.read(out, "$.message")).contains("template"), out);
    }

    @Test
    void pathsResolveWithoutAModelAndWithoutASession() throws Exception {
        // Two real qualities, one type under the first. The path naming the
        // second quality's MISSING type must come back CREATE, anchored to the
        // quality that exists — the §5.1 rule, reachable over HTTP with no
        // model in the loop.
        int mq = JsonPath.read(mvc.perform(post("/api/qualities/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + tag + " Drive\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
                "$.measuredQualityId");
        mvc.perform(post("/api/quality-types/create").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + tag + " Grit\",\"measuredQualityId\":" + mq + "}"))
                .andExpect(status().isCreated());

        String out = mvc.perform(post("/api/questions/ai/resolve-paths")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paths\":[{\"pathKey\":\"" + tag + " Drive \u203a " + tag + " Grit\",\"questionCount\":2},"
                                + "{\"pathKey\":\"" + tag + " Drive \u203a " + tag + " Focus\",\"questionCount\":1}]}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertTrue((Boolean) JsonPath.read(out, "$[0].fullyResolved"), out);
        assertEquals("CREATE", JsonPath.read(out, "$[1].segments[1].status"));
        assertEquals(mq, (int) JsonPath.read(out, "$[1].segments[1].parentMqId"));
    }

    @Test
    void aWorkbookPastTheSizeCapIsRefusedBeforeAnyParsing() throws Exception {
        // No newlines: a raw line break inside a JSON string is not JSON, and
        // the cap counts characters, not rows. Eight million against a cap of
        // six. Refused BEFORE the availability check, so this install - which
        // has no key - still reaches it.
        String huge = "aaaa,bbb ".repeat(1_000_000);
        String out = mvc.perform(post("/api/questions/ai/map-sheet")
                        .header(org.springframework.http.HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sheets\":[{\"name\":\"S\",\"csv\":\"" + huge + "\"}]}"))
                .andExpect(status().isPayloadTooLarge())
                .andReturn().getResponse().getContentAsString();
        assertTrue(((String) JsonPath.read(out, "$.message")).contains("too large"), out);
    }

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + (String) JsonPath.read(body, "$.token");
    }

    private int sortOrderOf(String response, String ref) {
        int id = JsonPath.read(response, "$.createdQualityTypeIds['" + ref + "']");
        return types.findById((long) id).orElseThrow().getSortOrder();
    }
}
