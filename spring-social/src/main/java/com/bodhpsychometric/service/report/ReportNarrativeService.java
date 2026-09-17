package com.bodhpsychometric.service.report;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.model.report.ReportComputation;
import com.bodhpsychometric.model.report.ReportComputationRule;
import com.bodhpsychometric.model.report.ReportComputationTagGuidance;
import com.bodhpsychometric.model.report.ReportNarrative;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;
import com.bodhpsychometric.repository.report.ReportNarrativeRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Prose for {@code NARRATIVE} tags: a model writes the paragraph, the formulae
 * still produce every number in it.
 *
 * <h2>The division of labour, which is the whole point</h2>
 *
 * <p>Scores are computed by pinned expressions in Java and are reproducible to
 * the digit. The model is handed those finished numbers and asked only to put
 * them into sentences. It never scores anything, never sees a raw answer, and
 * cannot move a band cut — so the worst a bad generation can do is word a
 * correct result badly, which a human reading the preview will catch. Compare
 * the alternative the {@code GENERATED} mode contemplates, where a model writes
 * the scoring code itself: there, a plausible mistake changes the number.
 *
 * <h2>What leaves the building</h2>
 *
 * <p>Rule names, rule slugs, and this respondent's computed values. That is
 * all.
 *
 * <p><b>No identity, and the exclusion is enforced twice.</b> First by
 * construction: the payload is built from {@code EvaluatedCohort.valuesFor},
 * which is keyed by rule slug and holds nothing else. Second by inspection:
 * any pinned rule that so much as <i>reads</i> a column in
 * {@link ReportColumnCatalog#IDENTITY_KEYS} has its value withheld, because a
 * formula is free to pass a name straight through and the value alone cannot
 * be trusted to reveal that it did. {@link #assertNoIdentity} is the last
 * check, immediately before the call, and it throws rather than redacts — a
 * silent scrub is a bug that ships.
 *
 * <p>The consequence worth stating: the model cannot address the respondent by
 * name, because it has never been told it. Guidance asking it to is guidance
 * that cannot be honoured, and the system prompt says so.
 *
 * <h2>Cost and latency</h2>
 *
 * <p>One call per respondent, not one per tag — every narrative tag for a
 * person is answered in a single request, which is both cheaper and the only
 * way two paragraphs about the same scores stay consistent with each other.
 * Calls across respondents run on a small fixed pool: a cohort of fifty answered
 * serially is several minutes of a held-open HTTP request.
 *
 * <p>Results are stored (see {@link ReportNarrative}) and reused while the
 * fingerprint matches, so a second download of the same batch costs nothing and
 * — more importantly — says the same thing.
 */
@Service
public class ReportNarrativeService {

    private static final Logger log = LoggerFactory.getLogger(ReportNarrativeService.class);

    /**
     * How many respondents are in flight at once.
     *
     * <p>Small on purpose. These are long IO-bound calls, so the pool exists to
     * stop a fifty-person batch taking fifty round trips end to end — not to go
     * as fast as possible. Push it higher and the provider's rate limiter turns
     * a slow batch into a failed one.
     */
    private static final int PARALLELISM = 4;

    /**
     * Hard cap on a generated paragraph, in characters.
     *
     * <p>A runaway answer is not just expensive — it overflows the box the
     * template drew for it, and a PDF has no scrollbar.
     */
    private static final int MAX_NARRATIVE_CHARS = 4000;

    private final OpenAiClient openAi;
    private final ReportNarrativeRepository narratives;
    private final ObjectMapper json;
    private final boolean enabled;

    public ReportNarrativeService(OpenAiClient openAi,
            ReportNarrativeRepository narratives,
            ObjectMapper json,
            @Value("${app.report.narrative.enabled:true}") boolean enabled) {
        this.openAi = openAi;
        this.narratives = narratives;
        this.json = json;
        this.enabled = enabled;
    }

    /** Configured, switched on, and therefore offerable on a screen. */
    public boolean isAvailable() {
        return enabled && openAi.isAvailable();
    }

    public String model() {
        return openAi.model();
    }

    /** The tags on this template a model is expected to write. */
    public static List<String> narrativeTags(ReportTemplate template) {
        if (template == null) {
            return List.of();
        }
        return template.getBindings().stream()
                .filter(b -> ReportTagBinding.TYPE_NARRATIVE.equals(b.getBinderType()))
                .sorted(Comparator.comparingInt(ReportTagBinding::getSortOrder))
                .map(ReportTagBinding::getTag)
                .toList();
    }

    /**
     * Write (or reuse) every narrative tag for every respondent in a batch.
     *
     * @param valuesByAttempt each respondent's computed values, keyed by rule
     *                        slug — straight from {@code valuesFor(row)}
     * @return attempt id → (tag → prose). An attempt with nothing to write is
     *         absent rather than mapped to an empty map.
     */
    public Map<Long, Map<String, String>> resolveForCohort(ReportComputation computation,
            ReportTemplate template,
            Map<Long, Map<String, Object>> valuesByAttempt) {

        List<String> tags = narrativeTags(template);
        if (tags.isEmpty() || valuesByAttempt.isEmpty()) {
            return Map.of();
        }
        if (!isAvailable()) {
            throw new IllegalStateException("This report has placeholders a model writes ("
                    + String.join(", ", tags) + "), but AI is not configured. "
                    + "Set OPENAI_API_KEY and restart, or bind those placeholders to a "
                    + "value or fixed text instead.");
        }

        Map<String, String> guidance = guidanceByTag(computation);
        Map<String, String> ruleLabels = ruleLabels(computation);
        Set<String> withheld = identityTaintedSlugs(computation);
        if (!withheld.isEmpty()) {
            // Not fatal: the report still has every other score to talk about.
            // Loud, though — a psychometrician who wrote a rule that passes a
            // name through needs to know it is being held back rather than
            // wonder why the prose never mentions it.
            log.warn("Computation {} withholds {} rule value(s) from the narrative payload "
                    + "because they read identity columns: {}",
                    computation.getReportComputationId(), withheld.size(), withheld);
        }

        // ── 1. what is already written, and still valid ───────────────────
        Map<Long, Map<String, String>> out = new LinkedHashMap<>();
        List<Job> jobs = new ArrayList<>();

        Map<Long, Map<String, ReportNarrative>> stored =
                storedFor(computation.getReportComputationId(), valuesByAttempt.keySet());

        for (Map.Entry<Long, Map<String, Object>> entry : valuesByAttempt.entrySet()) {
            Long attemptId = entry.getKey();
            Map<String, Object> safeValues = safeValues(entry.getValue(), withheld);
            Map<String, ReportNarrative> existing =
                    stored.getOrDefault(attemptId, Map.of());

            Map<String, String> resolved = new LinkedHashMap<>();
            List<String> missing = new ArrayList<>();
            for (String tag : tags) {
                String fingerprint = fingerprint(tag, guidance.get(tag), safeValues);
                ReportNarrative row = existing.get(tag);
                if (row != null && fingerprint.equals(row.getPromptFingerprint())) {
                    resolved.put(tag, row.getNarrativeText());
                } else {
                    missing.add(tag);
                }
            }
            if (!missing.isEmpty()) {
                jobs.add(new Job(attemptId, missing, safeValues));
            }
            out.put(attemptId, resolved);
        }

        if (jobs.isEmpty()) {
            return out;
        }

        // ── 2. the calls, in parallel, with no JPA in sight ───────────────
        // Entities are deliberately left behind here: what crosses onto the
        // pool is strings and numbers, and what comes back is strings. A lazy
        // proxy touched on a worker thread is an exception a long way from its
        // cause.
        List<Written> written = callInParallel(jobs, tags, guidance, ruleLabels);

        // ── 3. persist, on the calling thread ─────────────────────────────
        String model = openAi.model();
        LocalDateTime now = LocalDateTime.now();
        List<ReportNarrative> toSave = new ArrayList<>();
        for (Written w : written) {
            Map<String, ReportNarrative> existing =
                    stored.getOrDefault(w.attemptId(), Map.of());
            for (Map.Entry<String, String> e : w.texts().entrySet()) {
                String tag = e.getKey();
                String text = e.getValue();
                String fingerprint = fingerprint(tag, guidance.get(tag), w.safeValues());

                // Reuse the row if there is one: the unique key is
                // (computation, attempt, tag), so inserting a second would be
                // a duplicate-key failure at commit rather than an update.
                ReportNarrative row = existing.get(tag);
                if (row == null) {
                    row = new ReportNarrative();
                    row.setComputation(computation);
                    row.setRespondentAssessmentMappingId(w.attemptId());
                    row.setTag(tag);
                }
                row.setNarrativeText(text);
                row.setPromptFingerprint(fingerprint);
                row.setModel(model);
                row.setGeneratedAt(now);
                toSave.add(row);

                out.computeIfAbsent(w.attemptId(), k -> new LinkedHashMap<>()).put(tag, text);
            }
        }
        narratives.saveAll(toSave);
        return out;
    }

    /** Throw away a computation's stored prose, so the next render rewrites it. */
    public int clear(Long computationId) {
        return narratives.deleteByComputationId(computationId);
    }

    // ── the call ──────────────────────────────────────────────────────────

    private record Job(Long attemptId, List<String> tags, Map<String, Object> safeValues) {
    }

    private record Written(Long attemptId, Map<String, String> texts,
            Map<String, Object> safeValues) {
    }

    private List<Written> callInParallel(List<Job> jobs, List<String> allTags,
            Map<String, String> guidance, Map<String, String> ruleLabels) {

        if (jobs.size() == 1) {
            Job only = jobs.get(0);
            return List.of(new Written(only.attemptId(),
                    writeFor(only, guidance, ruleLabels), only.safeValues()));
        }

        List<Written> out = new ArrayList<>(jobs.size());
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(PARALLELISM, jobs.size()));
        try {
            List<Callable<Written>> tasks = jobs.stream()
                    .map(job -> (Callable<Written>) () -> new Written(job.attemptId(),
                            writeFor(job, guidance, ruleLabels), job.safeValues()))
                    .toList();
            List<Future<Written>> futures = new ArrayList<>(tasks.size());
            for (Callable<Written> task : tasks) {
                futures.add(pool.submit(task));
            }
            for (Future<Written> future : futures) {
                try {
                    out.add(future.get());
                } catch (ExecutionException e) {
                    // One respondent's failure fails the batch. The alternative
                    // is a ZIP where some reports have a paragraph and some have
                    // a blank space, and nothing on the outside says which.
                    Throwable cause = e.getCause() == null ? e : e.getCause();
                    throw cause instanceof RuntimeException re
                            ? re
                            : new IllegalStateException(cause.getMessage(), cause);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Report generation was interrupted.", e);
                }
            }
        } finally {
            pool.shutdownNow();
        }
        return out;
    }

    /** One respondent, one request, every tag they still need. */
    private Map<String, String> writeFor(Job job, Map<String, String> guidance,
            Map<String, String> ruleLabels) {

        assertNoIdentity(job.safeValues());

        String user = userPrompt(job, guidance, ruleLabels);
        String answer = openAi.completeAsJson(SYSTEM_PROMPT, user);

        JsonNode root;
        try {
            root = json.readTree(answer);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "The model's answer was not readable JSON, so no report was written.", e);
        }
        // Accept both the documented envelope and a bare object keyed by tag —
        // models produce the second often enough that refusing it would be
        // pedantry that costs a whole batch.
        JsonNode body = root.has("narratives") ? root.get("narratives") : root;

        Map<String, String> out = new LinkedHashMap<>();
        for (String tag : job.tags()) {
            JsonNode value = body.path(tag);
            if (value.isMissingNode() || value.isNull() || value.asText().isBlank()) {
                throw new IllegalStateException("The model returned nothing for ${" + tag
                        + "}. Nothing was written rather than leaving a gap in the report.");
            }
            out.put(tag, clean(value.asText()));
        }
        return out;
    }

    /**
     * Flatten to a single paragraph and cap the length.
     *
     * <p>Every resolved value is HTML-escaped by {@link ReportValueResolver} on
     * the way into the template, which is what stops a model emitting markup
     * into a PDF. The cost of that is that a newline would print as a space
     * anyway, so the text is normalised here instead of arriving with invisible
     * structure that survives to no effect.
     */
    private static String clean(String text) {
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() <= MAX_NARRATIVE_CHARS
                ? flat
                : flat.substring(0, MAX_NARRATIVE_CHARS).trim();
    }

    // ── the payload ───────────────────────────────────────────────────────

    private static final String SYSTEM_PROMPT = """
            You write one short section of a psychometric report.

            You are given scores that have ALREADY been calculated by fixed \
            formulae, and instructions for what each section should say. Your \
            only job is to turn those finished numbers into careful prose.

            Rules, all of them absolute:
            1. Use ONLY the values you are given. Never calculate, estimate, \
               adjust, round differently, or infer a score that is not listed.
            2. You do not know who this person is. You have not been told their \
               name, age, sex, or any other identifying detail, and you must \
               never invent one or address them by name. Write in the third \
               person as "the respondent", or in the second person as "you", \
               following the instructions for the section.
            3. Never state or imply a clinical diagnosis, and never predict a \
               medical, legal, or employment outcome.
            4. Plain text only. No markdown, no HTML, no bullet characters, no \
               headings, no line breaks. One flowing paragraph per section \
               unless the instructions ask otherwise.
            5. If the instructions for a section ask for something the values \
               cannot support, write what the values do support and say nothing \
               about the rest. Do not apologise or mention these rules.

            Answer with a JSON object whose keys are exactly the section names \
            you were asked for and whose values are the prose for each. No other \
            keys.
            """;

    private String userPrompt(Job job, Map<String, String> guidance,
            Map<String, String> ruleLabels) {

        StringBuilder sb = new StringBuilder(1024);
        sb.append("## Calculated values for this respondent\n\n");
        if (job.safeValues().isEmpty()) {
            sb.append("(none)\n");
        } else {
            for (Map.Entry<String, Object> e : job.safeValues().entrySet()) {
                String label = ruleLabels.getOrDefault(e.getKey(), e.getKey());
                sb.append("- ").append(label)
                        .append(" (").append(e.getKey()).append("): ")
                        .append(e.getValue() == null
                                ? "no value for this respondent"
                                : ReportValueResolver.format(e.getValue(), null))
                        .append('\n');
            }
        }

        sb.append("\n## Sections to write\n");
        for (String tag : job.tags()) {
            String note = guidance.get(tag);
            sb.append("\n### ").append(tag).append('\n');
            sb.append(note == null || note.isBlank()
                    ? "No specific instructions were given. Summarise the values above "
                            + "that are most relevant, in two or three sentences."
                    : note.trim())
                    .append('\n');
        }

        sb.append("\nReturn JSON with exactly these keys: ")
                .append(job.tags().stream().map(t -> '"' + t + '"')
                        .collect(Collectors.joining(", ")))
                .append('.');
        return sb.toString();
    }

    // ── identity, guarded twice ───────────────────────────────────────────

    /**
     * Slugs whose value must not be sent, because the rule behind them reads a
     * column that identifies the respondent.
     *
     * <p>Judged on what the rule READS, never on what it returned. A formula
     * that copies {@code core:name} through produces a value indistinguishable
     * from any other string, so inspecting the output is exactly the check that
     * cannot work.
     */
    private static Set<String> identityTaintedSlugs(ReportComputation computation) {
        Set<String> out = new java.util.LinkedHashSet<>();
        for (ReportComputationRule link : computation.getRules()) {
            ReportRuleVersion version = link.getRuleVersion();
            List<String> keys = ReportRuleService.parseKeys(version.getReferencedKeysJson());
            if (keys.stream().anyMatch(ReportColumnCatalog::isIdentityColumn)) {
                out.add(version.getRule().getSlug());
            }
        }
        return out;
    }

    private static Map<String, Object> safeValues(Map<String, Object> ruleValues,
            Set<String> withheld) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : ruleValues.entrySet()) {
            if (!withheld.contains(e.getKey())) {
                out.put(e.getKey(), e.getValue());
            }
        }
        return out;
    }

    /**
     * The last gate before the network.
     *
     * <p>Throws rather than scrubbing. If an identity key has reached this
     * point, the filtering above has a hole in it, and quietly deleting the
     * offending entry would hide the hole while shipping every other request
     * that finds it. A failed batch is recoverable; a leak is not.
     */
    private static void assertNoIdentity(Map<String, Object> payload) {
        List<String> offending = payload.keySet().stream()
                .filter(ReportColumnCatalog::isIdentityColumn)
                .toList();
        if (!offending.isEmpty()) {
            throw new IllegalStateException("Refusing to send identifying columns to the model: "
                    + String.join(", ", offending));
        }
    }

    // ── odds and ends ─────────────────────────────────────────────────────

    private Map<Long, Map<String, ReportNarrative>> storedFor(Long computationId,
            Set<Long> attemptIds) {
        Map<Long, Map<String, ReportNarrative>> out = new LinkedHashMap<>();
        for (ReportNarrative row : narratives.findByComputationReportComputationId(computationId)) {
            if (attemptIds.contains(row.getRespondentAssessmentMappingId())) {
                out.computeIfAbsent(row.getRespondentAssessmentMappingId(),
                        k -> new LinkedHashMap<>()).put(row.getTag(), row);
            }
        }
        return out;
    }

    private static Map<String, String> guidanceByTag(ReportComputation computation) {
        Map<String, String> out = new LinkedHashMap<>();
        for (ReportComputationTagGuidance row : computation.getTagGuidance()) {
            out.put(row.getTag(), row.getGuidance());
        }
        return out;
    }

    private static Map<String, String> ruleLabels(ReportComputation computation) {
        Map<String, String> out = new LinkedHashMap<>();
        for (ReportComputationRule link : computation.getRules()) {
            out.put(link.getRuleVersion().getRule().getSlug(),
                    link.getRuleVersion().getRule().getName());
        }
        return out;
    }

    /**
     * Everything that went into one narrative, hashed.
     *
     * <p>The VALUES are part of it, not just the guidance. A respondent who
     * re-sat the assessment and scored differently must not keep a paragraph
     * describing the old score — that is the failure mode that would make
     * stored prose worse than no prose at all.
     */
    private String fingerprint(String tag, String guidance, Map<String, Object> safeValues) {
        StringBuilder sb = new StringBuilder(256);
        sb.append(openAi.model()).append(' ')
                .append(tag).append(' ')
                .append(guidance == null ? "" : guidance.trim()).append(' ');
        safeValues.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(e -> sb.append(e.getKey()).append('=')
                        .append(ReportValueResolver.format(e.getValue(), null)).append(' '));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
