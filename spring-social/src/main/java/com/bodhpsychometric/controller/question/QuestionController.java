package com.bodhpsychometric.controller.question;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.MqtScoreRequest;
import com.bodhpsychometric.dto.MqtScoreResponse;
import com.bodhpsychometric.dto.QuestionOptionRequest;
import com.bodhpsychometric.dto.QuestionOptionResponse;
import com.bodhpsychometric.dto.QuestionRequest;
import com.bodhpsychometric.dto.QuestionResponse;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.scoring.OptionMqtScore;
import com.bodhpsychometric.model.scoring.QuestionMqtScore;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityTypeRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.scoring.OptionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionMqtScoreRepository;

import jakarta.validation.Valid;

/**
 * CRUD for standalone bank questions, their options and their MQT scoring.
 * Attaching questions to a questionnaire is the questionnaire-authoring
 * flow, not this controller — getByQuestionnaireId serves that flow's reads.
 *
 * Options and scores travel inside the question payload as the full desired
 * state; the backend replaces what is stored to match, in one transaction
 * (the cascade persists the question first, each option row then carries its
 * generated id — no separate create-options-then-map step).
 *
 * Scoring rows are OWNED by this flow and rebuilt on every update, so they
 * do not lock a question. Respondent answers do: with answers present the
 * option set is frozen and the question cannot be deleted — pre-checked,
 * because inside a transaction a caught FK violation still kills the commit.
 */
@RestController
@RequestMapping("/api/questions")
@Transactional
public class QuestionController {

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private QuestionMqtScoreRepository questionMqtScoreRepository;

    @Autowired
    private OptionMqtScoreRepository optionMqtScoreRepository;

    @Autowired
    private AssessmentAnswerRepository assessmentAnswerRepository;

    @Autowired
    private MeasuredQualityTypeRepository measuredQualityTypeRepository;

    @Autowired
    private QuestionnaireQuestionRepository questionnaireQuestionRepository;

    @GetMapping("/getAll")
    public List<QuestionResponse> getAllQuestions() {
        return questionRepository.findAll().stream().map(this::toResponse).toList();
    }

    /** Questions of one questionnaire, each carrying THAT placement's section and order. */
    @GetMapping("/getByQuestionnaireId/{questionnaireId}")
    public List<QuestionResponse> getQuestionsByQuestionnaire(@PathVariable Long questionnaireId) {
        return questionnaireQuestionRepository
                .findByQuestionnaireQuestionnaireIdOrderBySortOrderAscQuestionnaireQuestionIdAsc(questionnaireId)
                .stream().map(m -> toResponse(m.getQuestion(), m)).toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<QuestionResponse> getQuestionById(@PathVariable Long id) {
        return questionRepository.findById(id)
                .map(q -> ResponseEntity.ok(toResponse(q)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createQuestion(@Valid @RequestBody QuestionRequest request) {
        Map<Long, MeasuredQualityType> mqts = resolveMqts(request);
        if (mqts == null) {
            return unknownMqt();
        }
        Question question = new Question();
        applyFields(question, request);
        rebuildOptions(question, request.options());
        questionRepository.save(question);
        writeScores(question, request, mqts);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(question));
    }

    /**
     * Bulk authoring: create N bank questions in one call. Each item gets its
     * OWN option rows and its own question/option score rows — nothing is
     * shared between items, exactly like N calls to /create.
     *
     * All-or-nothing: every item is validated BEFORE anything is written.
     * Returning a 400 mid-loop would still COMMIT the items already saved
     * (a normal return from a @Transactional method commits), leaving a
     * partial bulk behind an error response.
     *
     * `List<@Valid QuestionRequest>` — NOT `@Valid List<…>`, which does not
     * cascade into elements and silently validates nothing. The element form
     * makes Spring validate each item against QuestionRequest's own
     * constraints and answer 400 with the failing item's position. The
     * hand-written checks below stay for the rules bean validation cannot
     * express (a referenced MQT must exist).
     */
    @PostMapping("/bulk-create")
    public ResponseEntity<?> bulkCreateQuestions(@RequestBody List<@Valid QuestionRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "no questions in payload"));
        }
        // Pass 1 — validate everything up front.
        List<Map<Long, MeasuredQualityType>> resolvedMqts = new java.util.ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            QuestionRequest request = requests.get(i);
            if (request.stem() == null || request.stem().isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "question " + (i + 1) + ": stem is required"));
            }
            Map<Long, MeasuredQualityType> mqts = resolveMqts(request);
            if (mqts == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "question " + (i + 1) + ": a referenced MQT does not exist"));
            }
            resolvedMqts.add(mqts);
        }
        // Pass 2 — write, returning the created questions so callers get ids
        // (the questionnaire-attach flow needs them).
        List<QuestionResponse> created = new java.util.ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            QuestionRequest request = requests.get(i);
            Question question = new Question();
            applyFields(question, request);
            rebuildOptions(question, request.options());
            questionRepository.save(question);
            writeScores(question, request, resolvedMqts.get(i));
            created.add(toResponse(question));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateQuestion(@PathVariable Long id,
            @Valid @RequestBody QuestionRequest request) {
        Question question = questionRepository.findById(id).orElse(null);
        if (question == null) {
            return ResponseEntity.notFound().build();
        }
        Map<Long, MeasuredQualityType> mqts = resolveMqts(request);
        if (mqts == null) {
            return unknownMqt();
        }
        boolean hasAnswers = assessmentAnswerRepository.existsByQuestionQuestionId(id);
        boolean optionsChanged = optionsChanged(question, request.options());
        if (optionsChanged && hasAnswers) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question already has responses — its options are locked"));
        }
        applyFields(question, request);
        // Scores are owned by this flow: wipe and rewrite. Option scores must
        // hit the DB before option rows are replaced, or the FK blocks.
        optionMqtScoreRepository.deleteByOptionQuestionQuestionId(id);
        questionMqtScoreRepository.deleteByQuestionQuestionId(id);
        optionMqtScoreRepository.flush();
        if (optionsChanged) {
            rebuildOptions(question, request.options());
        }
        questionRepository.save(question);
        writeScores(question, request, mqts);
        return ResponseEntity.ok(toResponse(question));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteQuestion(@PathVariable Long id) {
        if (!questionRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        if (assessmentAnswerRepository.existsByQuestionQuestionId(id)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question has responses and cannot be deleted"));
        }
        if (questionnaireQuestionRepository.existsByQuestionQuestionId(id)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question is used in a questionnaire — remove it there first"));
        }
        // Scoring rows belong to the question — they go first, then the
        // question takes its options with it via cascade.
        optionMqtScoreRepository.deleteByOptionQuestionQuestionId(id);
        questionMqtScoreRepository.deleteByQuestionQuestionId(id);
        optionMqtScoreRepository.flush();
        questionRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // ── Response assembly ─────────────────────────────────────────────────

    private QuestionResponse toResponse(Question q) {
        return toResponse(q, null);
    }

    /** With a placement, the response carries that questionnaire's section and order. */
    private QuestionResponse toResponse(Question q, QuestionnaireQuestion placement) {
        List<MqtScoreResponse> questionScores = questionMqtScoreRepository
                .findByQuestionQuestionId(q.getQuestionId()).stream()
                .map(s -> toScore(s.getMeasuredQualityType(), s.getScore()))
                .toList();
        Map<Long, List<MqtScoreResponse>> byOption = optionMqtScoreRepository
                .findByOptionQuestionQuestionId(q.getQuestionId()).stream()
                .collect(Collectors.groupingBy(s -> s.getOption().getOptionId(),
                        Collectors.mapping(s -> toScore(s.getMeasuredQualityType(), s.getScore()),
                                Collectors.toList())));
        List<QuestionOptionResponse> options = q.getOptions().stream()
                .map(o -> QuestionOptionResponse.from(o, byOption.getOrDefault(o.getOptionId(), List.of())))
                .toList();
        List<QuestionResponse.UsedInRef> usedIn = questionnaireQuestionRepository
                .findByQuestionQuestionId(q.getQuestionId()).stream()
                .map(m -> new QuestionResponse.UsedInRef(
                        m.getQuestionnaire().getQuestionnaireId(), m.getQuestionnaire().getName()))
                .toList();
        return QuestionResponse.from(q, usedIn,
                placement == null || placement.getSection() == null ? null : placement.getSection().getSectionId(),
                placement == null ? null : placement.getSortOrder(),
                placement == null ? null : placement.getQuestionTag(),
                options, questionScores);
    }

    private MqtScoreResponse toScore(MeasuredQualityType mqt, int score) {
        return new MqtScoreResponse(mqt.getMeasuredQualityTypeId(), mqt.getName(), score);
    }

    // ── Scoring writes ────────────────────────────────────────────────────

    /**
     * Resolves every MQT id referenced anywhere in the payload. Returns null
     * when an id does not exist (caller 400s).
     */
    private Map<Long, MeasuredQualityType> resolveMqts(QuestionRequest request) {
        var ids = new java.util.LinkedHashSet<Long>();
        dedupe(request.mqtScores()).keySet().forEach(ids::add);
        for (QuestionOptionRequest o : sanitized(request.options())) {
            dedupe(o.mqtScores()).keySet().forEach(ids::add);
        }
        Map<Long, MeasuredQualityType> found = measuredQualityTypeRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(MeasuredQualityType::getMeasuredQualityTypeId, m -> m));
        return found.keySet().containsAll(ids) ? found : null;
    }

    private void writeScores(Question question, QuestionRequest request, Map<Long, MeasuredQualityType> mqts) {
        for (Map.Entry<Long, Integer> e : dedupe(request.mqtScores()).entrySet()) {
            QuestionMqtScore row = new QuestionMqtScore();
            row.setQuestion(question);
            row.setMeasuredQualityType(mqts.get(e.getKey()));
            row.setScore(e.getValue());
            questionMqtScoreRepository.save(row);
        }
        // Options in the entity list line up index-for-index with the
        // sanitized payload — rebuildOptions built them from the same list.
        List<QuestionOptionRequest> want = sanitized(request.options());
        List<Option> have = question.getOptions();
        for (int i = 0; i < want.size() && i < have.size(); i++) {
            for (Map.Entry<Long, Integer> e : dedupe(want.get(i).mqtScores()).entrySet()) {
                OptionMqtScore row = new OptionMqtScore();
                row.setOption(have.get(i));
                row.setMeasuredQualityType(mqts.get(e.getKey()));
                row.setScore(e.getValue());
                optionMqtScoreRepository.save(row);
            }
        }
    }

    /** Last entry wins when the same MQT appears twice; order preserved. */
    private Map<Long, Integer> dedupe(List<MqtScoreRequest> scores) {
        Map<Long, Integer> out = new LinkedHashMap<>();
        if (scores != null) {
            for (MqtScoreRequest s : scores) {
                if (s != null && s.measuredQualityTypeId() != null) {
                    out.put(s.measuredQualityTypeId(), s.score());
                }
            }
        }
        return out;
    }

    private ResponseEntity<Map<String, String>> unknownMqt() {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "One of the referenced MQTs does not exist"));
    }

    // ── Fields & options ──────────────────────────────────────────────────

    private void applyFields(Question question, QuestionRequest request) {
        question.setContentType(request.contentType() == null ? ContentType.TEXT : request.contentType());
        question.setQuestionTexString(request.stem().trim());
        question.setMediaUrl(request.mediaUrl());
        question.setRiskFlag(Boolean.TRUE.equals(request.riskFlag()));
    }

    /** True when the requested option set differs from what is stored. */
    private boolean optionsChanged(Question question, List<QuestionOptionRequest> requested) {
        List<QuestionOptionRequest> want = sanitized(requested);
        List<Option> have = question.getOptions();
        if (want.size() != have.size()) {
            return true;
        }
        for (int i = 0; i < want.size(); i++) {
            QuestionOptionRequest w = want.get(i);
            Option h = have.get(i);
            if (!Objects.equals(w.optionText(), h.getOptionText())
                    || contentTypeOf(w) != h.getContentType()
                    || !Objects.equals(w.mediaUrl(), h.getMediaUrl())) {
                return true;
            }
        }
        return false;
    }

    /** Replaces the option set; list order becomes sortOrder. */
    private void rebuildOptions(Question question, List<QuestionOptionRequest> requested) {
        question.getOptions().clear();
        List<QuestionOptionRequest> want = sanitized(requested);
        for (int i = 0; i < want.size(); i++) {
            QuestionOptionRequest w = want.get(i);
            Option option = new Option();
            option.setOptionText(w.optionText());
            option.setContentType(contentTypeOf(w));
            option.setMediaUrl(w.mediaUrl());
            option.setSortOrder(i);
            question.addOption(option);
        }
    }

    /** Drops rows with neither text nor media — nothing to show a respondent. */
    private List<QuestionOptionRequest> sanitized(List<QuestionOptionRequest> requested) {
        if (requested == null) {
            return List.of();
        }
        return requested.stream()
                .filter(o -> (o.optionText() != null && !o.optionText().isBlank())
                        || (o.mediaUrl() != null && !o.mediaUrl().isBlank()))
                .map(o -> new QuestionOptionRequest(
                        o.optionText() == null || o.optionText().isBlank() ? null : o.optionText().trim(),
                        contentTypeOf(o),
                        o.mediaUrl() == null || o.mediaUrl().isBlank() ? null : o.mediaUrl().trim(),
                        o.mqtScores()))
                .toList();
    }

    private ContentType contentTypeOf(QuestionOptionRequest o) {
        return o.contentType() == null ? ContentType.TEXT : o.contentType();
    }
}
