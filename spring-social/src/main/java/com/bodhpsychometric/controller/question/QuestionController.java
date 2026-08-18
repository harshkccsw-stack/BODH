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

import com.bodhpsychometric.dto.MqtRefResponse;
import com.bodhpsychometric.dto.MqtScoreRequest;
import com.bodhpsychometric.dto.MqtScoreResponse;
import com.bodhpsychometric.dto.QuestionOptionRequest;
import com.bodhpsychometric.dto.QuestionOptionResponse;
import com.bodhpsychometric.dto.QuestionRequest;
import com.bodhpsychometric.dto.QuestionResponse;
import com.bodhpsychometric.dto.QuestionRowRequest;
import com.bodhpsychometric.dto.QuestionRowResponse;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;
import com.bodhpsychometric.model.scoring.OptionMqtScore;
import com.bodhpsychometric.model.scoring.QuestionMqtScore;
import com.bodhpsychometric.model.scoring.QuestionRowMqt;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityTypeRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.scoring.OptionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionRowMqtRepository;

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
 * option set AND the selection rule are frozen and the question cannot be
 * deleted — pre-checked, because inside a transaction a caught FK violation
 * still kills the commit.
 */
@RestController
@RequestMapping("/api/questions")
@Transactional
public class QuestionController {

    /**
     * What a linear scale means when the payload does not say — every scale
     * authored before the range existed, and every caller that still omits it.
     */
    private static final int DEFAULT_SCALE_FROM = 1;
    private static final int DEFAULT_SCALE_TO = 5;

    /**
     * Not a design limit — the author may pick any range, and negative ones
     * (a bipolar -3—3) are deliberately allowed. This is a guard against a
     * TYPO: the points are stored as real Option rows, so "1 to 1000000" is a
     * million-row insert in one transaction with nothing to undo it. 1000 is
     * two orders of magnitude past any real instrument and three short of the
     * accident.
     */
    private static final int MAX_SCALE_POINTS = 1000;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private QuestionMqtScoreRepository questionMqtScoreRepository;

    @Autowired
    private OptionMqtScoreRepository optionMqtScoreRepository;

    @Autowired
    private QuestionRowMqtRepository questionRowMqtRepository;

    @Autowired
    private AssessmentAnswerRepository assessmentAnswerRepository;

    @Autowired
    private MeasuredQualityTypeRepository measuredQualityTypeRepository;

    @Autowired
    private QuestionnaireQuestionRepository questionnaireQuestionRepository;

    // A bank question edit changes what every questionnaire placing it
    // delivers, so update evicts their Redis content entries. Delete needs no
    // hook: a placed question cannot be deleted (the 409 below), so a delete
    // never touches delivered content.
    @Autowired
    private com.bodhpsychometric.service.PortalContentService portalContentService;

    @GetMapping("/getAll")
    public List<QuestionResponse> getAllQuestions() {
        return questionRepository.findAll().stream().map(this::toResponse).toList();
    }

    /**
     * Questions of one questionnaire, each carrying THAT placement's section
     * and order. Display order: section by section, positions inside each —
     * NOT sortOrder alone, which is per-section and would interleave them.
     */
    @GetMapping("/getByQuestionnaireId/{questionnaireId}")
    public List<QuestionResponse> getQuestionsByQuestionnaire(@PathVariable Long questionnaireId) {
        return questionnaireQuestionRepository.findInDisplayOrder(questionnaireId)
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
        String problem = firstProblem(request);
        if (problem != null) {
            return ResponseEntity.badRequest().body(Map.of("message", problem));
        }
        Question question = new Question();
        applyFields(question, request);
        rebuildOptions(question, request);
        rebuildRows(question, request);
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
            String problem = firstProblem(request);
            if (problem != null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "question " + (i + 1) + ": " + problem));
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
            rebuildOptions(question, request);
            rebuildRows(question, request);
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
        String problem = firstProblem(request);
        if (problem != null) {
            return ResponseEntity.badRequest().body(Map.of("message", problem));
        }
        boolean hasAnswers = assessmentAnswerRepository.existsByQuestionQuestionId(id);
        // Checked before the option freeze so a type switch is reported as
        // what it is — switching MCQ → LINEAR_SCALE also replaces the options,
        // and "its options are locked" would be a confusing way to say so.
        if (question.getQuestionType() != typeOf(request) && hasAnswers) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question already has responses — its type is locked"));
        }
        boolean optionsChanged = optionsChanged(question, request);
        if (optionsChanged && hasAnswers) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question already has responses — its options are locked"));
        }
        // Rows freeze for the same reason options do: an answer points AT a
        // row, and re-wording or dropping one strands answers that nothing
        // downstream could repair. Which MQTs a row measures is scoring,
        // though — owned by this flow, rebuilt every save, never frozen.
        boolean rowsChanged = rowsChanged(question, request);
        if (rowsChanged && hasAnswers) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question already has responses — its rows are locked"));
        }
        // Same reasoning as the option freeze: tightening EQUALS 3 to 2 would
        // strand answer sets the new rule calls impossible, and nothing
        // downstream could repair them. Loosening is safe in principle, but
        // one condition beats four.
        if (selectionChanged(question, request) && hasAnswers) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question already has responses — how many options it takes is locked"));
        }
        // shuffleOptions is deliberately NOT frozen: an answer stores an
        // optionId, never a position, so flipping it strands nothing. The only
        // effect mid-collection is that earlier respondents saw the authored
        // order and later ones see a shuffled one — which is what was asked for.
        applyFields(question, request);
        // Scores are owned by this flow: wipe and rewrite. Option scores must
        // hit the DB before option rows are replaced, or the FK blocks.
        optionMqtScoreRepository.deleteByOptionQuestionQuestionId(id);
        questionMqtScoreRepository.deleteByQuestionQuestionId(id);
        questionRowMqtRepository.deleteByQuestionRowQuestionQuestionId(id);
        optionMqtScoreRepository.flush();
        questionRowMqtRepository.flush();
        if (optionsChanged) {
            rebuildOptions(question, request);
        }
        // Rebuilt whenever the rows differ AND whenever they don't: the
        // nominations were just deleted above, and writeScores re-attaches
        // them to the row entities this list holds.
        if (rowsChanged) {
            rebuildRows(question, request);
        }
        questionRepository.save(question);
        writeScores(question, request, mqts);
        portalContentService.evictForQuestion(id);
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
        // question takes its options AND rows with it via cascade.
        optionMqtScoreRepository.deleteByOptionQuestionQuestionId(id);
        questionMqtScoreRepository.deleteByQuestionQuestionId(id);
        questionRowMqtRepository.deleteByQuestionRowQuestionQuestionId(id);
        optionMqtScoreRepository.flush();
        questionRowMqtRepository.flush();
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
        Map<Long, List<MqtRefResponse>> byRow = questionRowMqtRepository
                .findByQuestionRowQuestionQuestionId(q.getQuestionId()).stream()
                .collect(Collectors.groupingBy(m -> m.getQuestionRow().getQuestionRowId(),
                        Collectors.mapping(m -> MqtRefResponse.from(m.getMeasuredQualityType()),
                                Collectors.toList())));
        List<QuestionRowResponse> rows = q.getRows().stream()
                .map(r -> QuestionRowResponse.from(r, byRow.getOrDefault(r.getQuestionRowId(), List.of())))
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
                options, rows, questionScores);
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
        for (QuestionOptionRequest o : desiredOptions(request)) {
            dedupe(o.mqtScores()).keySet().forEach(ids::add);
        }
        // Grid rows name MQTs without scoring them — a third level, and just
        // as able to reference an id that does not exist.
        for (QuestionRowRequest r : sanitizedRows(request)) {
            ids.addAll(r.measuredQualityTypeIds());
        }
        Map<Long, MeasuredQualityType> found = measuredQualityTypeRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(MeasuredQualityType::getMeasuredQualityTypeId, m -> m));
        return found.keySet().containsAll(ids) ? found : null;
    }

    private void writeScores(Question question, QuestionRequest request, Map<Long, MeasuredQualityType> mqts) {
        boolean scale = typeOf(request) == QuestionType.LINEAR_SCALE;
        for (Map.Entry<Long, Integer> e : dedupe(request.mqtScores()).entrySet()) {
            QuestionMqtScore row = new QuestionMqtScore();
            row.setQuestion(question);
            row.setMeasuredQualityType(mqts.get(e.getKey()));
            // On a LINEAR_SCALE the question-level row NOMINATES an MQT and
            // contributes nothing flat of its own — the point the respondent
            // picks is the score, and it is carried by the generated option
            // rows (see desiredOptions). Stored as 0 rather than trusting the
            // payload, so the nomination can never read as a flat score.
            row.setScore(scale ? 0 : e.getValue());
            questionMqtScoreRepository.save(row);
        }
        // Options in the entity list line up index-for-index with the
        // effective payload — rebuildOptions built them from the same list.
        List<QuestionOptionRequest> want = desiredOptions(request);
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
        // Grid rows: which MQTs the item measures. No score — the number
        // comes from the column. Rows line up index-for-index with the
        // sanitized payload for the same reason options do.
        List<QuestionRowRequest> wantRows = sanitizedRows(request);
        List<QuestionRow> haveRows = question.getRows();
        for (int i = 0; i < wantRows.size() && i < haveRows.size(); i++) {
            for (Long mqtId : wantRows.get(i).measuredQualityTypeIds()) {
                QuestionRowMqt row = new QuestionRowMqt();
                row.setQuestionRow(haveRows.get(i));
                row.setMeasuredQualityType(mqts.get(mqtId));
                questionRowMqtRepository.save(row);
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
        question.setQuestionType(typeOf(request));
        question.setQuestionTexString(request.stem().trim());
        question.setMediaUrl(request.mediaUrl());
        question.setRiskFlag(Boolean.TRUE.equals(request.riskFlag()));
        question.setSelectionRule(request.selectionRule());
        question.setSelectionCount(requestedCount(request));
        // Shuffling belongs to an MCQ (validateType refuses it elsewhere) and
        // is stored false for the rest, so switching a shuffled MCQ to a scale
        // cannot leave a flag behind that would reorder the points 1—5.
        question.setShuffleOptions(Boolean.TRUE.equals(request.shuffleOptions())
                && typeOf(request) == QuestionType.MCQ);
        // Scale labels belong to a scale. Cleared on every other type, so
        // switching a question away from LINEAR_SCALE cannot leave captions
        // behind that no screen would ever show again.
        boolean scale = typeOf(request) == QuestionType.LINEAR_SCALE;
        question.setScaleLowLabel(scale ? trimmedOrNull(request.scaleLowLabel()) : null);
        question.setScaleHighLabel(scale ? trimmedOrNull(request.scaleHighLabel()) : null);
        // The range is stored RESOLVED, not as sent: an omitted pair means
        // 1—5, and writing that down is what stops "no range" and "1—5" being
        // two different states for anything reading the row later.
        question.setScaleFrom(scale ? scaleFrom(request) : null);
        question.setScaleTo(scale ? scaleTo(request) : null);
    }

    /** MCQ whenever the payload does not say — what every pre-type caller means. */
    private QuestionType typeOf(QuestionRequest request) {
        return request.questionType() == null ? QuestionType.MCQ : request.questionType();
    }

    private String trimmedOrNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * The count as it will be STORED: null whenever there is no rule, so a
     * half-set pair can never reach the table even by a path that skipped
     * validation. Also what the freeze compares against, or clearing a rule
     * while leaving a stale count in the payload would read as "unchanged".
     */
    private Integer requestedCount(QuestionRequest request) {
        return request.selectionRule() == null ? null : request.selectionCount();
    }

    /**
     * Every hand-written payload rule in one call — null when the payload is
     * fine, otherwise the first problem. One entry point so /create,
     * /bulk-create and /update cannot drift apart on what they check.
     */
    private String firstProblem(QuestionRequest request) {
        String typeProblem = validateType(request);
        return typeProblem != null ? typeProblem : validateSelection(request);
    }

    /**
     * How many options the respondent may pick — null when the payload is
     * fine, otherwise the message. Cross-field and list-dependent, so bean
     * validation cannot express it; bulk pass 1 calls this too.
     *
     * Counted against the SANITIZED option list, which is what rebuildOptions
     * actually writes — a form with trailing blank option rows would
     * otherwise be validated against options that never reach the database.
     */
    private String validateSelection(QuestionRequest request) {
        SelectionRule rule = request.selectionRule();
        Integer count = request.selectionCount();
        if (rule == null) {
            // A count with no rule is always a typo — silently dropping it
            // would ship a question that behaves differently from the sheet
            // or form that described it.
            return count == null ? null
                    : "selectionCount " + count + " needs a selectionRule (MIN, MAX or EQUALS)";
        }
        if (count == null || count < 1) {
            return "selectionRule " + rule + " needs a selectionCount of at least 1";
        }
        int optionCount = desiredOptions(request).size();
        if (count > optionCount) {
            return "selectionCount " + count + " but the question only has " + optionCount
                    + " option" + (optionCount == 1 ? "" : "s");
        }
        return null;
    }

    /** True when the requested rule/count differ from what is stored. */
    private boolean selectionChanged(Question question, QuestionRequest request) {
        return question.getSelectionRule() != request.selectionRule()
                || !Objects.equals(question.getSelectionCount(), requestedCount(request));
    }

    /** True when the requested option set differs from what is stored. */
    private boolean optionsChanged(Question question, QuestionRequest request) {
        List<QuestionOptionRequest> want = desiredOptions(request);
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
    private void rebuildOptions(Question question, QuestionRequest request) {
        question.getOptions().clear();
        List<QuestionOptionRequest> want = desiredOptions(request);
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

    /**
     * The option set this payload actually means — the ONE place the question
     * type decides what the options are, so validation, the freeze comparison,
     * the rebuild and the score write can never disagree about them.
     *
     * MCQ: the sanitized payload, as always. LINEAR_SCALE: the points
     * scaleFrom—scaleTo, GENERATED and ignoring whatever options the caller
     * sent, each carrying its own value as the score for every MQT the
     * QUESTION is mapped to. That derivation is what lets a scale be scored
     * with no option-level mapping in the UI while staying an ordinary
     * single-choice question downstream — the submit validator, the export
     * sheet and MqtScoringService all see option rows with scores, exactly
     * like an MCQ. SHORT_ANSWER: none at all, which is the whole point of it.
     */
    private List<QuestionOptionRequest> desiredOptions(QuestionRequest request) {
        QuestionType type = typeOf(request);
        if (type == QuestionType.SHORT_ANSWER || type == QuestionType.PARAGRAPH) {
            return List.of();
        }
        if (type != QuestionType.LINEAR_SCALE) {
            return sanitized(request.options());
        }
        int from = scaleFrom(request);
        int to = scaleTo(request);
        // Validation refuses an inverted or absurd range, but this runs for
        // the freeze comparison too — clamp rather than allocate a list from
        // a payload that is about to be rejected anyway.
        if (to < from || (long) to - from + 1 > MAX_SCALE_POINTS) {
            return List.of();
        }
        List<Long> mqtIds = List.copyOf(dedupe(request.mqtScores()).keySet());
        List<QuestionOptionRequest> points = new java.util.ArrayList<>(to - from + 1);
        for (int point = from; point <= to; point++) {
            final int value = point;
            points.add(new QuestionOptionRequest(
                    String.valueOf(point),
                    ContentType.TEXT,
                    null,
                    mqtIds.stream().map(id -> new MqtScoreRequest(id, value)).toList()));
        }
        return points;
    }

    /** The range as it will be STORED — both ends default together, or neither. */
    private int scaleFrom(QuestionRequest request) {
        return request.scaleFrom() == null ? DEFAULT_SCALE_FROM : request.scaleFrom();
    }

    private int scaleTo(QuestionRequest request) {
        return request.scaleTo() == null ? DEFAULT_SCALE_TO : request.scaleTo();
    }

    /**
     * Type rules the payload cannot express with annotations — null when it is
     * fine, otherwise the message. Bulk pass 1 calls this too.
     */
    private String validateType(QuestionRequest request) {
        QuestionType type = typeOf(request);
        if (type == QuestionType.LINEAR_SCALE) {
            // A scale is one pick by definition: "choose 2 points on a 1—5
            // scale" has no meaning, and allowing it would hand the portal a
            // cap of 2 on a widget that renders as a radio row.
            if (request.selectionRule() != null || request.selectionCount() != null) {
                return "a linear scale takes one answer — it cannot have a selection rule";
            }
            // The points are ordinal: a scale delivered 3,1,5,2,4 is not a
            // randomised question, it is a broken one.
            if (Boolean.TRUE.equals(request.shuffleOptions())) {
                return "a linear scale's points are ordered — they cannot be shuffled";
            }
            // Both ends travel together: one alone would silently pair the
            // author's number with a default they never saw.
            if ((request.scaleFrom() == null) != (request.scaleTo() == null)) {
                return "a scale range needs both scaleFrom and scaleTo, or neither";
            }
            int from = scaleFrom(request);
            int to = scaleTo(request);
            if (to <= from) {
                return "scaleTo (" + to + ") must be greater than scaleFrom (" + from + ")";
            }
            // long, because to - from overflows int at the extremes and would
            // wrap into a value that passes.
            long points = (long) to - from + 1;
            if (points > MAX_SCALE_POINTS) {
                return "a scale of " + points + " points is too wide — the most is " + MAX_SCALE_POINTS;
            }
            return null;
        }
        if (type == QuestionType.SHORT_ANSWER) {
            // Free text: no options, no rows, no rule, no shuffle. Refused
            // rather than ignored, so nothing can store a shape that no
            // screen honours.
            if (request.selectionRule() != null || request.selectionCount() != null) {
                return "a short answer is typed, not picked — it cannot have a selection rule";
            }
            if (Boolean.TRUE.equals(request.shuffleOptions())) {
                return "a short answer has no options to shuffle";
            }
            if (!sanitized(request.options()).isEmpty()) {
                return "a short answer has no options";
            }
            if (request.rows() != null && !request.rows().isEmpty()) {
                return "a short answer has no rows";
            }
            // Question-level MQT scores ARE allowed and are earned for
            // answering at all — see the class comment on MqtScoringService.
            return null;
        }
        if (type == QuestionType.PARAGRAPH) {
            // Reserved so widening the MySQL enum was paid for once (V17).
            // Nothing may write it until the type is actually built.
            return "long-answer questions are not available yet";
        }
        if (type == QuestionType.LIKERT_GRID) {
            // One pick per row for now. The rule PLUMBING is per-row already
            // (SelectionBounds runs against each row in the submit
            // validator), so exposing checkbox grids later is a UI change —
            // but nothing may write a rule until that UI exists, or grids
            // would ship a cap no screen can honour.
            if (request.selectionRule() != null || request.selectionCount() != null) {
                return "a grid takes one answer per row — it cannot have a selection rule";
            }
            // A grid's columns are one shared rating scale, in order, for every
            // row — shuffling them would scramble the scale itself. Shuffling
            // the ROWS is the version that makes sense for a grid; that is a
            // separate flag and does not exist yet.
            if (Boolean.TRUE.equals(request.shuffleOptions())) {
                return "a grid's columns are a shared rating scale — they cannot be shuffled";
            }
            if (sanitizedRows(request).isEmpty()) {
                return "a grid needs at least one row";
            }
            // Two columns is the point of a grid: one column is a checkbox
            // list wearing a table's clothes, and the respondent has no
            // choice to make.
            if (desiredOptions(request).size() < 2) {
                return "a grid needs at least two columns";
            }
            return null;
        }
        return null;
    }

    /**
     * The grid rows this payload actually means — trimmed, deduped MQT
     * nominations, and empty for every type but LIKERT_GRID so switching a
     * grid to another type drops its rows instead of leaving them to be
     * delivered by a screen that has no idea what to do with them.
     *
     * A row needs text OR at least one MQT to survive: a form with trailing
     * blank row inputs then behaves exactly like the option editor.
     */
    private List<QuestionRowRequest> sanitizedRows(QuestionRequest request) {
        if (typeOf(request) != QuestionType.LIKERT_GRID || request.rows() == null) {
            return List.of();
        }
        return request.rows().stream()
                .filter(java.util.Objects::nonNull)
                .map(r -> new QuestionRowRequest(
                        r.rowText() == null || r.rowText().isBlank() ? null : r.rowText().trim(),
                        r.measuredQualityTypeIds() == null ? List.<Long>of()
                                : r.measuredQualityTypeIds().stream()
                                        .filter(java.util.Objects::nonNull)
                                        .distinct().toList()))
                .filter(r -> r.rowText() != null || !r.measuredQualityTypeIds().isEmpty())
                .toList();
    }

    /** Replaces the row set; list order becomes sortOrder. */
    private void rebuildRows(Question question, QuestionRequest request) {
        question.getRows().clear();
        List<QuestionRowRequest> want = sanitizedRows(request);
        for (int i = 0; i < want.size(); i++) {
            QuestionRow row = new QuestionRow();
            row.setRowText(want.get(i).rowText());
            row.setSortOrder(i);
            question.addRow(row);
        }
    }

    /** True when the requested row set differs from what is stored. */
    private boolean rowsChanged(Question question, QuestionRequest request) {
        List<QuestionRowRequest> want = sanitizedRows(request);
        List<QuestionRow> have = question.getRows();
        if (want.size() != have.size()) {
            return true;
        }
        for (int i = 0; i < want.size(); i++) {
            if (!Objects.equals(want.get(i).rowText(), have.get(i).getRowText())) {
                return true;
            }
        }
        return false;
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
