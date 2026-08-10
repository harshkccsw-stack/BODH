package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.config.RequestIdFilter;

/**
 * The error contract, pinned. Both frontends read
 * `e?.response?.data?.message` in every api file, so what matters for each
 * failure is the status AND that a message came back at all — these are the
 * cases that used to fall through to Spring's default body, which carries no
 * message unless devtools happens to be on the classpath.
 *
 * Deliberately driven through real endpoints rather than a stub controller:
 * that way the test also proves the exception actually reaches the advice.
 * The one exception is the 500 case, which needs an endpoint that fails on
 * purpose.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ApiExceptionHandlerTest {

    @Autowired
    private MockMvc mvc;

    /**
     * An endpoint that throws, to exercise the catch-all. Nested in a
     * @TestConfiguration so it exists only for this test class — and declared
     * only once: a nested @RestController is already registered as a bean, so
     * an extra @Bean method for it would be an ambiguous mapping.
     */
    @TestConfiguration
    static class FailingEndpoint {

        @RestController
        static class Boom {
            @GetMapping("/api/__test__/boom")
            public String boom() {
                throw new IllegalStateException("column uqUserEmail leaked internals");
            }
        }
    }

    // ── Bad input ──────────────────────────────────────────────────────────

    @Test
    void pathVariableThatIsNotANumberIs400WithAMessage() throws Exception {
        mvc.perform(get("/api/questions/getById/abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("\"id\" must be a number"));
    }

    @Test
    void malformedJsonBodyIs400AndDoesNotEchoTheParser() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The request body could not be read"));
    }

    @Test
    void validationFailureReportsTheFieldMessage() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"email\":\"not-an-email\",\"dob\":\"01-01-1990\","
                                + "\"phone\":null,\"gender\":null,\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    /**
     * The hole this closes: `@Valid List<T>` does not cascade, so every
     * element of a bulk body used to skip bean validation entirely. The
     * position matters as much as the message when forty questions were
     * posted at once.
     */
    @Test
    void bulkBodyValidatesEachElementAndSaysWhichOneFailed() throws Exception {
        mvc.perform(post("/api/questions/bulk-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("["
                                + "{\"contentType\":\"TEXT\",\"stem\":\"Fine\",\"options\":[],\"mqtScores\":[]},"
                                + "{\"contentType\":\"TEXT\",\"stem\":\"\",\"options\":[],\"mqtScores\":[]}"
                                + "]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("item 2")))
                .andExpect(jsonPath("$.message").value(Matchers.containsString("stem is required")));
    }

    @Test
    void bulkBodyRejectionWritesNothing() throws Exception {
        long before = countQuestions();
        mvc.perform(post("/api/questions/bulk-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("["
                                + "{\"contentType\":\"TEXT\",\"stem\":\"Saved?\",\"options\":[],\"mqtScores\":[]},"
                                + "{\"contentType\":\"TEXT\",\"stem\":\"   \",\"options\":[],\"mqtScores\":[]}"
                                + "]"))
                .andExpect(status().isBadRequest());
        // All-or-nothing: the valid first item must not have been committed.
        org.junit.jupiter.api.Assertions.assertEquals(before, countQuestions());
    }

    private long countQuestions() throws Exception {
        String body = mvc.perform(get("/api/questions/getAll"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return body.split("\"questionId\"", -1).length - 1L;
    }

    // ── Wrong door ─────────────────────────────────────────────────────────

    @Test
    void wrongHttpMethodIs405WithAMessage() throws Exception {
        mvc.perform(post("/api/reports/getRespondents"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.message").value("POST is not supported on this endpoint"));
    }

    @Test
    void unknownEndpointIs404WithAMessage() throws Exception {
        mvc.perform(get("/api/there-is-no-such-thing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("No such endpoint"));
    }

    /**
     * The regression that motivated extending ResponseEntityExceptionHandler.
     * A hand-rolled `@ExceptionHandler(Exception.class)` is matched before
     * Spring's own DefaultHandlerExceptionResolver, so it silently swallowed
     * every framework exception it did not name — this one answered 500
     * "Something went wrong on our side" for what is purely a caller mistake,
     * and logged a stack trace for it.
     */
    @Test
    void aWrongContentTypeIs415NotAServerError() throws Exception {
        mvc.perform(post("/api/qualities/create")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("not json"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.message").isNotEmpty())
                // A 500 would carry a reference; a 4xx must not pretend to be one.
                .andExpect(jsonPath("$.requestId").doesNotExist());
    }

    /**
     * 406 is the one case that cannot carry our body, and that is correct
     * rather than a gap: the caller has said it accepts only XML, and the
     * error shape is JSON. There is no message to send that it would take.
     * Asserted anyway so the empty body is a known, intended outcome.
     */
    @Test
    void anUnacceptableResponseTypeIs406WithNoBodyItCouldRead() throws Exception {
        mvc.perform(get("/api/qualities/getAll").accept(MediaType.APPLICATION_XML))
                .andExpect(status().isNotAcceptable())
                .andExpect(content().string(""));
    }

    // ── Thrown deliberately ────────────────────────────────────────────────

    @Test
    void thrownResponseStatusKeepsItsReason() throws Exception {
        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // ── The backstop ───────────────────────────────────────────────────────

    @Test
    void unexpectedFailureIs500WithAReferenceAndNoInternals() throws Exception {
        mvc.perform(get("/api/__test__/boom"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message")
                        .value(Matchers.containsString("Something went wrong on our side")))
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                // The exception text names a database constraint. It belongs
                // in the log, never in the response.
                .andExpect(content().string(Matchers.not(Matchers.containsString("uqUserEmail"))));
    }

    // ── Request id ─────────────────────────────────────────────────────────

    @Test
    void everyResponseCarriesARequestId() throws Exception {
        mvc.perform(get("/api/reports/getRespondents"))
                .andExpect(status().isOk())
                .andExpect(header().string(RequestIdFilter.HEADER, Matchers.not(Matchers.emptyOrNullString())));
    }

    @Test
    void aCallersOwnRequestIdIsKeptWhenItIsSafe() throws Exception {
        mvc.perform(get("/api/reports/getRespondents").header(RequestIdFilter.HEADER, "trace-123"))
                .andExpect(header().string(RequestIdFilter.HEADER, "trace-123"));
    }

    @Test
    void aForgedRequestIdIsReplaced() throws Exception {
        // Newlines would let a caller write their own log lines.
        mvc.perform(get("/api/reports/getRespondents").header(RequestIdFilter.HEADER, "bad\nid"))
                .andExpect(header().string(RequestIdFilter.HEADER, Matchers.not("bad\nid")))
                .andExpect(header().string(RequestIdFilter.HEADER, Matchers.not(Matchers.emptyOrNullString())));
    }
}
