package com.bodhpsychometric.service.report;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The one place this application talks to OpenAI.
 *
 * <p>Built on the JDK's own {@link HttpClient} rather than a vendor SDK: the
 * whole surface used here is one POST to one endpoint, and a dependency that
 * ships its own HTTP stack, JSON mapper and retry policy would be a far larger
 * thing to own than the forty lines it replaces.
 *
 * <h2>What this is allowed to see</h2>
 *
 * Rule text and COLUMN NAMES. Never respondent rows, and never the identity
 * columns named in {@link ReportColumnCatalog#IDENTITY_KEYS} — the same line
 * the report generator already draws. Translation is a question about wording
 * and column names; nobody's score has to leave the building to answer it.
 *
 * <h2>Failure is ordinary</h2>
 *
 * Every failure here — no key, wrong model, timeout, rate limit, OpenAI down —
 * costs one button on one authoring screen. Reports do not go through this
 * path, and rules can still be written by hand exactly as before, so nothing
 * in this class retries in a loop, queues work, or degrades anything.
 */
@Service
public class OpenAiClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiClient.class);

    // Spring's own mapper (Jackson 3 under Boot 4.1), not a private instance:
    // one configuration, and no second mapper to drift from how every other
    // response in this application is written.
    private final ObjectMapper json;

    private final boolean enabled;
    private final String apiKey;
    private final String model;
    private final String baseUrl;
    private final Duration timeout;
    private final HttpClient http;

    public OpenAiClient(
            @Value("${app.openai.enabled:true}") boolean enabled,
            @Value("${app.openai.api-key:}") String apiKey,
            @Value("${app.openai.model:gpt-4.1}") String model,
            @Value("${app.openai.base-url:https://api.openai.com/v1}") String baseUrl,
            @Value("${app.openai.timeout-seconds:120}") int timeoutSeconds,
            ObjectMapper json) {
        this.json = json;
        this.enabled = enabled;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    /**
     * Configured and switched on. Checked BEFORE a screen offers translation,
     * so an unconfigured install hides the button rather than showing one that
     * fails when pressed.
     */
    public boolean isAvailable() {
        return enabled && !apiKey.isBlank();
    }

    public String model() {
        return model;
    }

    /**
     * One chat completion, answered as JSON.
     *
     * <p>{@code response_format: json_object} is what makes the reply parseable
     * without regexing prose out of it. It guarantees syntax and nothing about
     * meaning — every field is still validated by the caller, because a model
     * returning well-formed JSON full of invented function names is exactly the
     * failure this whole path is designed to survive.
     *
     * @return the assistant's message content, which is a JSON document
     */
    public String completeAsJson(String systemPrompt, String userPrompt) {
        if (!isAvailable()) {
            throw new IllegalStateException(
                    "AI translation is not configured. Set OPENAI_API_KEY in secrets.env "
                            + "and restart the server.");
        }

        String body = json.writeValueAsString(Map.of(
                "model", model,
                "messages", java.util.List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)),
                "response_format", Map.of("type", "json_object")));

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/chat/completions"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new IllegalStateException("Could not reach OpenAI: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("The translation request was interrupted.", e);
        }

        if (response.statusCode() / 100 != 2) {
            // The body carries the useful half of the story ("model_not_found",
            // "insufficient_quota"), and the status code alone has sent people
            // hunting for the wrong problem often enough to be worth unwrapping.
            String detail = errorMessage(response.body());
            log.warn("OpenAI returned {} for model {}: {}", response.statusCode(), model, detail);
            throw new IllegalStateException("OpenAI refused the request (" + response.statusCode()
                    + "): " + detail);
        }

        try {
            JsonNode root = json.readTree(response.body());
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (content.isMissingNode() || content.asText().isBlank()) {
                throw new IllegalStateException("OpenAI returned an empty answer.");
            }
            return content.asText();
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Could not read OpenAI's answer.", e);
        }
    }

    /** The human-readable half of an OpenAI error body, if there is one. */
    private String errorMessage(String body) {
        try {
            JsonNode message = json.readTree(body).path("error").path("message");
            if (!message.isMissingNode() && !message.asText().isBlank()) {
                return message.asText();
            }
        } catch (Exception ignored) {
            // Fall through to the raw body — a truncated body still beats nothing.
        }
        return body == null || body.isBlank()
                ? "no detail given"
                : body.substring(0, Math.min(300, body.length()));
    }
}
