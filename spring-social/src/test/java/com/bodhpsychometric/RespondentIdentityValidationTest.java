package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The birth-date bound and the split phone, pinned at the endpoint.
 *
 * <p>Driven through /api/respondents/create rather than against the validators
 * directly: what matters is that a bad value is refused with a message the
 * frontends can show, which is a property of the whole chain — annotation,
 * validator, and the exception advice that turns a violation into
 * {"message": ...}. The @E164Phone case is the reason that last part is worth
 * proving, because a class-level constraint raises a GLOBAL error and the
 * advice used to read only field errors.
 *
 * <p>Every failing case asserts a NON-EMPTY message, not an exact string: the
 * wording lives in PhoneRules/@BirthDate and should be free to improve.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RespondentIdentityValidationTest {

    private static final DateTimeFormatter DOB = DateTimeFormatter.ofPattern("dd-MM-uuuu");

    @Autowired
    private MockMvc mvc;

    /**
     * A valid body with one field swapped, so each test changes one thing.
     *
     * <p>The email is per-test rather than shared: the two cases that expect a
     * 201 actually write a row, and a second one on the same address is a 409
     * on uqUserEmail — which would look like the validation rule failing when
     * it is only the fixture colliding with itself.
     */
    private static String body(String email, String dob, String countryCode, String phone) {
        return "{\"name\":\"__smoke__ Validation\",\"email\":\"" + email + "\","
                + "\"dob\":\"" + dob + "\",\"phoneCountryCode\":\"" + countryCode + "\","
                + "\"phone\":\"" + phone + "\",\"employeeId\":null,\"gender\":\"MALE\","
                + "\"isConsented\":false,\"organizationId\":null}";
    }

    private void expectRejected(String dob, String countryCode, String phone) throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("__smoke__rejected@example.com", dob, countryCode, phone)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // ── Date of birth ──────────────────────────────────────────────────────

    @Test
    void tomorrowIsNotABirthDate() throws Exception {
        expectRejected(LocalDate.now().plusDays(1).format(DOB), "+91", "9000000000");
    }

    /**
     * Today is IN range, not out of it. The boundary is worth a test of its
     * own: an off-by-one that excluded today would reject a real newborn and
     * would only be noticed by whoever hit it.
     */
    @Test
    void todayIsAcceptedAsTheUpperBound() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("__smoke__today@example.com",
                                LocalDate.now().format(DOB), "+91", "9000000001")))
                .andExpect(status().isCreated());
    }

    @Test
    void before1900IsRejected() throws Exception {
        expectRejected("31-12-1899", "+91", "9000000000");
    }

    // ── Phone ──────────────────────────────────────────────────────────────

    @Test
    void countryCodeMustCarryThePlus() throws Exception {
        expectRejected("12-06-1991", "91", "9000000000");
    }

    @Test
    void countryCodeCannotStartWithZero() throws Exception {
        expectRejected("12-06-1991", "+091", "9000000000");
    }

    @Test
    void nationalNumberIsDigitsOnly() throws Exception {
        expectRejected("12-06-1991", "+91", "90000 00000");
    }

    @Test
    void nationalNumberCannotCarryItsOwnCountryCode() throws Exception {
        expectRejected("12-06-1991", "+91", "+919000000000");
    }

    /**
     * The cross-field rule: both halves are individually well-formed — a real
     * 3-digit code and 14 digits, each inside its own pattern — and only their
     * TOTAL breaks E.164's 15. Nothing but @E164Phone can catch this, and the
     * assertion on the message is what proves a global constraint violation
     * still reaches the caller as something readable.
     */
    @Test
    void codeAndNumberTogetherCannotExceedFifteenDigits() throws Exception {
        expectRejected("12-06-1991", "+971", "12345678901234");
    }

    @Test
    void aShorterNationalNumberIsFine() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("__smoke__short@example.com", "12-06-1991", "+352", "621123456")))
                .andExpect(status().isCreated());
    }
}
