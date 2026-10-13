package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.dto.validation.NameRules;
import com.jayway.jsonpath.JsonPath;

/**
 * The person-name rule (2026-10-13): letters of any script, spaces,
 * apostrophes, hyphens, full stops — at every place a name is typed.
 *
 * <p>The rule itself is pinned against {@link NameRules} directly, with exact
 * messages, because the frontends' {@code lib/name.ts} mirrors that wording
 * word for word. The endpoints are then driven once each, to prove the
 * annotation reaches every creation point and the message survives the trip.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PersonNameTest {

    @Autowired
    private MockMvc mvc;

    // ── The rule ───────────────────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {
            "Meera Iyer",
            "Dr. Meera Iyer",
            "O'Brien",
            "O’Brien",          // the apostrophe a phone keyboard types
            "Jean-Luc Picard",
            "José Ñúñez",
            "प्रिया शर्मा",          // vowel signs and the virama are MARKS
            "क्‍ष",             // a half-form held by a zero-width joiner
            "李小龙",
            "محمد علي",
            "  Meera  ",            // stored trimmed
    })
    void namesFromAnyScriptPass(String name) {
        assertThat(NameRules.characterProblem(name)).isNull();
    }

    @Test
    void blankIsLeftToNotBlank() {
        assertThat(NameRules.characterProblem(null)).isNull();
        assertThat(NameRules.characterProblem("   ")).isNull();
    }

    @Test
    void digitsAreRefusedAndNamed() {
        assertThat(NameRules.characterProblem("Rahul 2")).isEqualTo(
                "Name cannot contain \"2\" — only letters, spaces, apostrophes ('), "
                        + "hyphens (-) and full stops (.) are allowed");
    }

    @Test
    void everyRefusedCharacterIsNamedOnceInOrder() {
        assertThat(NameRules.characterProblem("a@b#c@")).startsWith(
                "Name cannot contain \"@\" or \"#\" — ");
        assertThat(NameRules.characterProblem("<b>Meera</b>")).startsWith(
                "Name cannot contain \"<\", \">\" or \"/\" — ");
    }

    @Test
    void aLongListEndsInOthers() {
        assertThat(NameRules.characterProblem("A1234567")).startsWith(
                "Name cannot contain \"1\", \"2\", \"3\", \"4\", \"5\" or others — ");
    }

    @Test
    void digitsOfOtherScriptsAndEmojiAreRefused() {
        assertThat(NameRules.characterProblem("Ali ١٢")).startsWith("Name cannot contain \"١\" or \"٢\"");
        assertThat(NameRules.characterProblem("Meera 😀"))
                .startsWith("Name cannot contain \"😀\"");
    }

    /** Invisible characters are named in words — quoting them prints "". */
    @Test
    void invisibleCharactersAreDescribed() {
        assertThat(NameRules.characterProblem("Meera\tIyer")).startsWith("Name cannot contain a tab — ");
        assertThat(NameRules.characterProblem("Meera\nIyer")).startsWith("Name cannot contain a line break — ");
        assertThat(NameRules.characterProblem("Meera Iyer​"))
                .startsWith("Name cannot contain an invisible character — ");
    }

    @Test
    void punctuationAloneIsNotAName() {
        assertThat(NameRules.characterProblem(". - '")).isEqualTo(NameRules.NO_LETTER_MESSAGE);
    }

    // ── The endpoints ──────────────────────────────────────────────────────

    private static String respondentBody(String name, String email) {
        return "{\"name\":\"" + name + "\",\"email\":\"" + email + "\",\"dob\":\"12-06-1991\","
                + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\",\"employeeId\":null,"
                + "\"gender\":\"FEMALE\",\"isConsented\":false,\"organizationId\":null}";
    }

    @Test
    void respondentCreateRefusesABadName() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(respondentBody("Rahul 2", "name.rule.digit@test.local")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("\"2\"")));
    }

    @Test
    void respondentCreateAcceptsADevanagariName() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(respondentBody("प्रिया शर्मा", "name.rule.hindi@test.local")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("प्रिया शर्मा"));
    }

    /**
     * The message quotes what was typed, and a violation message is a
     * template — "{" and "$" must come back printed, not interpolated.
     */
    @Test
    void templateCharactersInANameArePrintedNotInterpolated() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(respondentBody("${1+1}", "name.rule.el@test.local")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString(
                        "Name cannot contain \"$\", \"{\", \"1\", \"+\" or \"}\"")));
    }

    @Test
    void respondentNamesStopAtTheColumnWidth() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(respondentBody("a".repeat(NameRules.MAX_LENGTH + 1),
                                "name.rule.long@test.local")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(NameRules.TOO_LONG_MESSAGE));
    }

    @Test
    void practitionerCreateRefusesABadName() throws Exception {
        mvc.perform(post("/api/practitioners/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"R2-D2\",\"email\":\"name.rule.pract@test.local\","
                                + "\"dob\":\"09-09-1989\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000005\","
                                + "\"practitionerStatus\":null,\"vertical\":null,\"organizationId\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("\"2\"")));
    }

    /** Validation runs before the token is even looked up. */
    @Test
    void portalRegistrationRefusesABadName() throws Exception {
        mvc.perform(post("/api/portal/register/no-such-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"a@b.com\",\"email\":\"name.rule.portal@test.local\","
                                + "\"dob\":\"1991-06-12\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000006\","
                                + "\"gender\":\"MALE\",\"employeeId\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("\"@\"")));
    }

    @Test
    void theSheetReportsABadNameAgainstItsRow() throws Exception {
        String org = mvc.perform(post("/api/organizations/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Name Rule Org\",\"orgEmail\":null,\"description\":null,"
                                + "\"logoBase64\":null,\"coBrandLogoBase64\":null,\"assessmentIds\":[]}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        int orgId = JsonPath.read(org, "$.organizationId");

        mvc.perform(post("/api/respondents/bulk-validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organizationId\":" + orgId + ",\"rows\":[{\"row\":7,\"name\":\"Rahul 2\","
                                + "\"email\":\"name.rule.sheet@test.local\",\"dob\":\"12-06-1991\","
                                + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000007\","
                                + "\"employeeId\":null,\"gender\":\"MALE\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues[0].row").value(7))
                .andExpect(jsonPath("$.issues[0].field").value("name"))
                .andExpect(jsonPath("$.issues[0].message").value(containsString("\"2\"")));
    }
}
