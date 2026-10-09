package com.bodhpsychometric.controller.question;

import java.util.ArrayList;
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
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.ExistingStemResponse;
import com.bodhpsychometric.dto.MqtScoreRequest;
import com.bodhpsychometric.dto.MqtScoreResponse;
import com.bodhpsychometric.dto.QuestionOptionRequest;
import com.bodhpsychometric.dto.QuestionOptionResponse;
import com.bodhpsychometric.dto.QuestionImportRequest;
import com.bodhpsychometric.dto.QuestionBulkDeleteRequest;
import com.bodhpsychometric.dto.QuestionRequest;
import com.bodhpsychometric.dto.QuestionResponse;
import com.bodhpsychometric.dto.QuestionRowRequest;
import com.bodhpsychometric.dto.QuestionRowResponse;
import com.bodhpsychometric.model.game.Game;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.question.enums.AnswerFormat;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;
import com.bodhpsychometric.model.scoring.OptionMqtScore;
import com.bodhpsychometric.model.scoring.QuestionMqtScore;
import com.bodhpsychometric.model.scoring.QuestionRowMqt;
import com.bodhpsychometric.model.taxonomy.MeasuredQuality;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.game.GameRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityTypeRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.questionnaire.SectionRepository;
import com.bodhpsychometric.service.questionnaire.PlacementTags;
import com.bodhpsychometric.repository.scoring.OptionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionRowMqtRepository;
import com.bodhpsychometric.service.question.StemMatcher;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;

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
    private MeasuredQualityRepository measuredQualityRepository;

    @Autowired
    private QuestionnaireQuestionRepository questionnaireQuestionRepository;

    // The group-membership sync re-stamps tags, which needs each
    // questionnaire's sections in display order.
    @Autowired
    private SectionRepository sectionRepository;

    // GAMES questions (V42): the catalog a question's one option links to.
    @Autowired
    private GameRepository gameRepository;

    // A bank question edit changes what every questionnaire placing it
    // delivers, so update evicts their Redis content entries. Delete needs no
    // hook: a placed question cannot be deleted (the 409 below), so a delete
    // never touches delivered content.
    @Autowired
    private com.bodhpsychometric.service.PortalContentService portalContentService;

    @GetMapping("/getAll")
    public List<QuestionResponse> getAllQuestions() {
        // Top-level only: a GROUP's members ride nested inside their parent's
        // response, never as bank rows of their own.
        return questionRepository.findByParentQuestionIsNull().stream().map(this::toResponse).toList();
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
        if (problem == null) {
            problem = gameProblem(request, null);
        }
        if (problem != null) {
            return ResponseEntity.badRequest().body(Map.of("message", problem));
        }
        Question question = createFromRequest(request, mqts);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(question));
    }

    /**
     * The one write path a VALIDATED create goes through — /create, bulk
     * pass 2 and import phase C alike, so a GROUP's members are born the
     * same way everywhere. For a GROUP the parent itself stores no options,
     * rows or scores (validateType refused them); each member is written
     * exactly like a standalone question and then hung off the parent.
     */
    private Question createFromRequest(QuestionRequest request, Map<Long, MeasuredQualityType> mqts) {
        Question question = new Question();
        applyFields(question, request);
        rebuildOptions(question, request);
        rebuildRows(question, request);
        questionRepository.save(question);
        writeScores(question, request, mqts);
        if (typeOf(request) == QuestionType.GROUP) {
            List<QuestionRequest> members = membersOf(request);
            for (int i = 0; i < members.size(); i++) {
                createMember(question, members.get(i), i, mqts);
            }
        }
        return question;
    }

    /** One new member, written like a standalone question, then hung off its group. */
    private Question createMember(Question parent, QuestionRequest request, int position,
            Map<Long, MeasuredQualityType> mqts) {
        Question member = new Question();
        applyFields(member, request);
        rebuildOptions(member, request);
        rebuildRows(member, request);
        member.setParentQuestion(parent);
        member.setGroupSortOrder(position);
        questionRepository.save(member);
        writeScores(member, request, mqts);
        return member;
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
        // Pass 1 — validate everything up front, and ALL of it: a sheet fixed
        // one error per upload is fixed forty uploads later.
        List<Map<Long, MeasuredQualityType>> resolvedMqts = new java.util.ArrayList<>();
        List<BatchProblem> problems = new java.util.ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            QuestionRequest request = requests.get(i);
            // "stem is required" is firstProblem's first answer (a GROUP may
            // be unheaded, so the rule lives in validateType, not on the DTO).
            Map<Long, MeasuredQualityType> mqts = resolveMqts(request);
            if (mqts == null) {
                problems.add(new BatchProblem(i, "a referenced MQT does not exist"));
                continue;
            }
            String problem = firstProblem(request);
            if (problem == null) {
                problem = gameProblem(request, null);
            }
            if (problem != null) {
                problems.add(new BatchProblem(i, problem));
                continue;
            }
            resolvedMqts.add(mqts);
        }
        if (!problems.isEmpty()) {
            return batchRefused(problems);
        }
        // Pass 2 — write, returning the created questions so callers get ids
        // (the questionnaire-attach flow needs them).
        List<QuestionResponse> created = new java.util.ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            created.add(toResponse(createFromRequest(requests.get(i), resolvedMqts.get(i))));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Which of these stems are already in the bank — asked by the template
     * upload before it creates anything, so re-uploading a sheet warns instead
     * of silently making a second copy of every question. Reads only; the AI
     * route answers the same question inside /ai/map-sheet with the same rule.
     */
    @PostMapping("/find-existing")
    public List<ExistingStemResponse> findExisting(@RequestBody List<String> stems) {
        return StemMatcher.findExisting(stems, questionRepository.findAllStems()).stream()
                .map(ExistingStemResponse::from)
                .toList();
    }

    /**
     * Questions AND the measured qualities they need, in one transaction.
     *
     * <h2>Why this endpoint exists</h2>
     *
     * An imported sheet names qualities the bank does not have. Creating those
     * through the taxonomy endpoints and then posting here is a dozen calls in
     * one logical act, and when the last one fails the qualities stay behind —
     * so the retry resolves its own leftovers as though somebody had chosen
     * them. Here it is all or nothing.
     *
     * <h2>The three phases, and the one keyword the guarantee rests on</h2>
     *
     * <ol>
     *   <li><b>A — validate everything that needs no ids.</b> Nothing has been
     *       written, so a returned 400 is safe. This is the only phase that may
     *       return one.
     *   <li><b>B — create the taxonomy</b>, qualities first, then types parent
     *       before child.
     *   <li><b>C — resolve the pending ids and write the questions</b>, through
     *       exactly the same helpers {@code /bulk-create} uses.
     * </ol>
     *
     * <b>Phases B and C throw and never return.</b> A {@code return
     * ResponseEntity.badRequest()} after phase B has run COMMITS the qualities
     * it created — the transaction is only rolled back by an exception — and
     * silently reproduces the half-built taxonomy this endpoint exists to
     * prevent. It would look like it worked. {@link ResponseStatusException}
     * rolls back and {@code ApiExceptionHandler} renders it in the same
     * {@code message} shape as every other error here.
     */
    @PostMapping("/import")
    public ResponseEntity<?> importQuestions(@Valid @RequestBody QuestionImportRequest request) {
        List<QuestionImportRequest.NewQuality> newQualities =
                request.newQualities() == null ? List.of() : request.newQualities();
        List<QuestionImportRequest.NewQualityType> newTypes =
                request.newQualityTypes() == null ? List.of() : request.newQualityTypes();

        /* ── Phase A — nothing is written, so these may RETURN ────────────── */

        Map<Long, QuestionImportRequest.NewQuality> qualityByRef = new LinkedHashMap<>();
        for (QuestionImportRequest.NewQuality q : newQualities) {
            if (q.ref() >= 0) {
                return bad("a new measured quality's ref must be negative (got " + q.ref() + ")");
            }
            if (qualityByRef.put(q.ref(), q) != null) {
                return bad("two new measured qualities share the ref " + q.ref());
            }
        }
        Map<Long, QuestionImportRequest.NewQualityType> typeByRef = new LinkedHashMap<>();
        for (QuestionImportRequest.NewQualityType t : newTypes) {
            if (t.ref() >= 0) {
                return bad("a new quality type's ref must be negative (got " + t.ref() + ")");
            }
            if (typeByRef.put(t.ref(), t) != null) {
                return bad("two new quality types share the ref " + t.ref());
            }
        }
        for (QuestionImportRequest.NewQualityType t : newTypes) {
            if (t.anchorCount() != 1) {
                return bad("\"" + t.name() + "\" needs exactly one parent — a measured quality "
                        + "or a quality type, given once");
            }
            if (t.qualityRef() != null && !qualityByRef.containsKey(t.qualityRef())) {
                return bad("\"" + t.name() + "\" is to be created under a measured quality that "
                        + "is not in this payload");
            }
            if (t.parentTypeRef() != null && !typeByRef.containsKey(t.parentTypeRef())) {
                return bad("\"" + t.name() + "\" is to be created under a quality type that is "
                        + "not in this payload");
            }
            if (t.qualityId() != null && !measuredQualityRepository.existsById(t.qualityId())) {
                return bad("\"" + t.name() + "\" names a measured quality that does not exist");
            }
            if (t.parentTypeId() != null && !measuredQualityTypeRepository.existsById(t.parentTypeId())) {
                return bad("\"" + t.name() + "\" names a quality type that does not exist");
            }
        }

        // Parent before child, and a loop refused rather than hung on.
        List<QuestionImportRequest.NewQualityType> ordered = new java.util.ArrayList<>();
        java.util.Set<Long> placed = new java.util.HashSet<>();
        boolean progress = true;
        while (ordered.size() < newTypes.size() && progress) {
            progress = false;
            for (QuestionImportRequest.NewQualityType t : newTypes) {
                if (placed.contains(t.ref())) {
                    continue;
                }
                if (t.parentTypeRef() == null || placed.contains(t.parentTypeRef())) {
                    ordered.add(t);
                    placed.add(t.ref());
                    progress = true;
                }
            }
        }
        if (ordered.size() != newTypes.size()) {
            return bad("the new quality types reference each other in a loop");
        }

        List<BatchProblem> problems = new java.util.ArrayList<>();
        for (int i = 0; i < request.questions().size(); i++) {
            QuestionRequest q = request.questions().get(i);
            // Pending ids are checked HERE, against the payload, because after
            // phase B an unmatched one would mean rolling back real writes.
            Long orphan = referencedMqtIds(q).stream()
                    .filter(id -> id != null && id < 0 && !typeByRef.containsKey(id))
                    .findFirst().orElse(null);
            if (orphan != null) {
                problems.add(new BatchProblem(i, "scores a quality type ("
                        + orphan + ") that this payload does not create"));
                continue;
            }
            String problem = firstProblem(q);
            if (problem == null) {
                problem = gameProblem(q, null);
            }
            if (problem != null) {
                problems.add(new BatchProblem(i, problem));
            }
        }
        if (!problems.isEmpty()) {
            return batchRefused(problems);
        }

        /* ── Phase B — writing starts here, so everything below THROWS ────── */

        Map<Long, MeasuredQuality> createdQualities = new LinkedHashMap<>();
        for (QuestionImportRequest.NewQuality q : newQualities) {
            String name = q.name().trim();
            requireNameFree(measuredQualityRepository.findAll().stream()
                    .map(MeasuredQuality::getName).toList(), name, "a measured quality");
            MeasuredQuality mq = new MeasuredQuality();
            mq.setName(name);
            mq.setDescription(q.description());
            createdQualities.put(q.ref(), measuredQualityRepository.save(mq));
        }

        Map<Long, MeasuredQualityType> createdTypes = new LinkedHashMap<>();
        for (QuestionImportRequest.NewQualityType t : ordered) {
            String name = t.name().trim();
            MeasuredQualityType node = new MeasuredQualityType();
            node.setName(name);

            if (t.parentTypeRef() != null || t.parentTypeId() != null) {
                MeasuredQualityType parent = t.parentTypeRef() != null
                        ? createdTypes.get(t.parentTypeRef())
                        : measuredQualityTypeRepository.findById(t.parentTypeId())
                                .orElseThrow(() -> conflict("a quality type named as a parent has gone"));
                requireNameFree(parent.getChildren().stream()
                        .map(MeasuredQualityType::getName).toList(), name,
                        "a type under \"" + parent.getName() + "\"");
                // Read the sibling count BEFORE adding, and add through the sync
                // helper: three roots created under one new quality in a single
                // transaction would otherwise all see an empty collection and
                // all take sortOrder 0.
                node.setSortOrder(parent.getChildren().size());
                parent.addChild(node);
            } else {
                MeasuredQuality mq = t.qualityRef() != null
                        ? createdQualities.get(t.qualityRef())
                        : measuredQualityRepository.findById(t.qualityId())
                                .orElseThrow(() -> conflict("a measured quality named as a parent has gone"));
                List<MeasuredQualityType> roots = mq.getTypes().stream()
                        .filter(MeasuredQualityType::isRoot).toList();
                requireNameFree(roots.stream().map(MeasuredQualityType::getName).toList(), name,
                        "a type under \"" + mq.getName() + "\"");
                node.setSortOrder(roots.size());
                mq.addType(node);
            }
            createdTypes.put(t.ref(), measuredQualityTypeRepository.save(node));
        }

        /* ── Phase C — the ordinary write path, with pending ids seeded in ── */

        List<QuestionResponse> created = new java.util.ArrayList<>();
        for (int i = 0; i < request.questions().size(); i++) {
            QuestionRequest q = request.questions().get(i);
            Map<Long, MeasuredQualityType> mqts = resolveMqts(q, createdTypes);
            if (mqts == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "question " + (i + 1) + ": a referenced MQT does not exist");
            }
            created.add(toResponse(createFromRequest(q, mqts)));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("questions", created);
        // ref -> real id, so the caller can show what it actually created
        // without re-fetching the whole taxonomy.
        body.put("createdQualityIds", createdQualities.entrySet().stream()
                .collect(LinkedHashMap::new,
                        (m, e) -> m.put(String.valueOf(e.getKey()), e.getValue().getMeasuredQualityId()),
                        LinkedHashMap::putAll));
        body.put("createdQualityTypeIds", createdTypes.entrySet().stream()
                .collect(LinkedHashMap::new,
                        (m, e) -> m.put(String.valueOf(e.getKey()), e.getValue().getMeasuredQualityTypeId()),
                        LinkedHashMap::putAll));
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    private ResponseEntity<?> bad(String message) {
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    /** One refused question of a batch: its 0-based position in the payload, and why. */
    private record BatchProblem(int index, String message) {
    }

    /**
     * A batch refused for EVERY problem it has, not the first one. `message`
     * keeps the old one-line shape ("question 3: …", plus how many more) for
     * any caller that reads only that; `problems` carries each by payload
     * position, which the upload maps back to the sheet row the author sees —
     * "question 3" names nothing once the review step has dropped a row.
     */
    private ResponseEntity<?> batchRefused(List<BatchProblem> problems) {
        BatchProblem first = problems.get(0);
        String message = "question " + (first.index() + 1) + ": " + first.message()
                + (problems.size() > 1 ? " (and " + (problems.size() - 1) + " more)" : "");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        body.put("problems", problems.stream()
                .map(p -> Map.of("index", (Object) p.index(), "message", p.message()))
                .toList());
        return ResponseEntity.badRequest().body(body);
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    /**
     * Refuses a name that already exists among its siblings. Neither measured
     * qualities nor their types are unique in general — the same construct name
     * under two different parents is deliberate, and the whole path resolver
     * depends on it. But two SIBLINGS of one name make that resolution
     * permanently ambiguous, and an import is exactly where such a name gets
     * chosen by a machine reading somebody's spreadsheet rather than by a person.
     */
    private void requireNameFree(List<String> existing, String name, String what) {
        String key = name.trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[\\s_-]", "");
        boolean clash = existing.stream()
                .anyMatch(n -> n != null
                        && n.trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[\\s_-]", "").equals(key));
        if (clash) {
            throw conflict(what + " called \"" + name + "\" already exists — "
                    + "use the existing one instead of creating a second");
        }
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateQuestion(@PathVariable Long id,
            @Valid @RequestBody QuestionRequest request) {
        Question question = questionRepository.findById(id).orElse(null);
        if (question == null) {
            return ResponseEntity.notFound().build();
        }
        // A member has no life of its own: everything about it — wording,
        // options, scores, its very existence — is the group's payload.
        if (question.isGroupMember()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This question belongs to a group — edit it through the group"));
        }
        Map<Long, MeasuredQualityType> mqts = resolveMqts(request);
        if (mqts == null) {
            return unknownMqt();
        }
        String problem = firstProblem(request);
        if (problem == null) {
            problem = gameProblem(request, question);
        }
        if (problem != null) {
            return ResponseEntity.badRequest().body(Map.of("message", problem));
        }
        boolean storedGroup = question.isGroup();
        boolean wantGroup = typeOf(request) == QuestionType.GROUP;
        List<Question> storedMembers = storedGroup ? membersOf(question) : List.of();
        // A GROUP parent is never answered or placed itself — its members
        // are, so "has answers" and "is placed" mean THEIR rows.
        boolean hasAnswers = storedGroup
                ? storedMembers.stream().anyMatch(
                        m -> assessmentAnswerRepository.existsByQuestionQuestionId(m.getQuestionId()))
                : assessmentAnswerRepository.existsByQuestionQuestionId(id);
        if (question.getQuestionType() != typeOf(request)) {
            // Checked before the option freeze so a type switch is reported as
            // what it is — switching MCQ → LINEAR_SCALE also replaces the
            // options, and "its options are locked" would confuse.
            if (hasAnswers) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                        "This question already has responses — its type is locked"));
            }
            // A switch INTO a group would leave the parent itself placed
            // (parents never are), and a switch OUT would have to delete
            // members that placements still reference — both need the
            // questionnaires to let go first.
            if (storedGroup || wantGroup) {
                boolean placed = storedGroup
                        ? storedMembers.stream().anyMatch(m -> questionnaireQuestionRepository
                                .existsByQuestionQuestionId(m.getQuestionId()))
                        : questionnaireQuestionRepository.existsByQuestionQuestionId(id);
                if (placed) {
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                            "This question is used in a questionnaire — remove it there before changing "
                                    + (storedGroup ? "it away from a group" : "it into a group")));
                }
            }
        }
        if (wantGroup) {
            return updateGroup(question, request, mqts, storedMembers, hasAnswers);
        }
        if (storedGroup) {
            // GROUP → ordinary type: the guards above proved no member is
            // answered or placed, so the members go first (they would be
            // orphans under a non-group parent).
            deleteMembers(storedMembers);
        }
        String frozen = frozenProblem(question, request, hasAnswers);
        if (frozen != null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", frozen));
        }
        applyUpdate(question, request, mqts);
        portalContentService.evictForQuestion(id);
        return ResponseEntity.ok(toResponse(question));
    }

    /**
     * The freeze rules an answered question is held to — null when the edit
     * passes, else the 409 message. One method so a standalone update and a
     * group member obey exactly the same law in the same order.
     *
     * shuffleOptions is deliberately NOT in here: an answer stores an
     * optionId, never a position, so flipping it strands nothing.
     */
    private String frozenProblem(Question question, QuestionRequest request, boolean hasAnswers) {
        if (!hasAnswers) {
            return null;
        }
        // Text → whole number would strand answers already written as text,
        // which the new rule calls impossible. Whole number → text only
        // widens what is accepted, so it always passes.
        if (question.answerFormat() == AnswerFormat.TEXT
                && answerFormatOf(request) == AnswerFormat.WHOLE_NUMBER) {
            return "This question already has text answers — it cannot be limited to numbers now";
        }
        if (optionsChanged(question, request)) {
            return "This question already has responses — its options are locked";
        }
        // Rows freeze for the same reason options do: an answer points AT a
        // row, and re-wording or dropping one strands answers that nothing
        // downstream could repair. Which MQTs a row measures is scoring,
        // though — owned by this flow, rebuilt every save, never frozen.
        if (rowsChanged(question, request)) {
            return "This question already has responses — its rows are locked";
        }
        // Same reasoning as the option freeze: tightening EQUALS 3 to 2 would
        // strand answer sets the new rule calls impossible, and nothing
        // downstream could repair them. Loosening is safe in principle, but
        // one condition beats four.
        if (selectionChanged(question, request)) {
            return "This question already has responses — how many options it takes is locked";
        }
        return null;
    }

    /**
     * The write half of an update, after every freeze has passed — fields,
     * options, rows, scores, in the one order that keeps the FKs happy.
     */
    private void applyUpdate(Question question, QuestionRequest request,
            Map<Long, MeasuredQualityType> mqts) {
        Long id = question.getQuestionId();
        boolean optionsChanged = optionsChanged(question, request);
        boolean rowsChanged = rowsChanged(question, request);
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
        } else {
            // The option SET is unchanged, but a description may not be —
            // optionsChanged deliberately ignores descriptions so that editing
            // one does not read as replacing the options and get refused on a
            // question that has answers. Sync them onto the existing rows,
            // which keeps every optionId (and therefore every answer) intact.
            syncOptionDescriptions(question, request);
        }
        // Rebuilt whenever the rows differ AND whenever they don't: the
        // nominations were just deleted above, and writeScores re-attaches
        // them to the row entities this list holds.
        if (rowsChanged) {
            rebuildRows(question, request);
        }
        questionRepository.save(question);
        writeScores(question, request, mqts);
    }

    /**
     * A GROUP staying (or becoming) a group. Membership — which questions,
     * in what order — is compared against what is stored and FROZEN the
     * moment any member has an answer. While the group is merely PLACED, a
     * membership change is allowed and the member placements of every
     * questionnaire using it are re-synced in the same transaction (rows
     * inserted and removed in place, renumbered and re-tagged) — the builder
     * edits a group that already sits in its own questionnaire, and a 409
     * there would make a placed group permanently uneditable. Each surviving
     * member is held to exactly the freeze rules a standalone question
     * obeys, pre-checked for ALL members before anything is written (a 409
     * after a partial write would still commit it).
     */
    private ResponseEntity<?> updateGroup(Question parent, QuestionRequest request,
            Map<Long, MeasuredQualityType> mqts, List<Question> storedMembers, boolean hasAnswers) {
        Map<Long, Question> storedById = new LinkedHashMap<>();
        for (Question m : storedMembers) {
            storedById.put(m.getQuestionId(), m);
        }
        List<QuestionRequest> want = membersOf(request);
        java.util.Set<Long> seen = new java.util.HashSet<>();
        for (QuestionRequest w : want) {
            if (w.questionId() == null) {
                continue;
            }
            if (!storedById.containsKey(w.questionId())) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "questionId " + w.questionId() + " is not one of this group's questions"));
            }
            if (!seen.add(w.questionId())) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "questionId " + w.questionId() + " appears twice in the group"));
            }
        }
        boolean membershipChanged = want.size() != storedMembers.size();
        for (int i = 0; !membershipChanged && i < want.size(); i++) {
            membershipChanged = !Objects.equals(want.get(i).questionId(),
                    storedMembers.get(i).getQuestionId());
        }
        if (membershipChanged && hasAnswers) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "This group already has responses — its questions are locked"));
        }
        // Every member's freeze, before any member's write.
        for (int i = 0; i < want.size(); i++) {
            QuestionRequest w = want.get(i);
            if (w.questionId() == null) {
                continue;
            }
            Question stored = storedById.get(w.questionId());
            boolean memberAnswered = assessmentAnswerRepository
                    .existsByQuestionQuestionId(stored.getQuestionId());
            if (stored.getQuestionType() != typeOf(w) && memberAnswered) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                        "Question " + (i + 1) + " in the group already has responses — its type is locked"));
            }
            String frozen = frozenProblem(stored, w, memberAnswered);
            if (frozen != null) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", frozen));
            }
        }
        // Which questionnaires place this group — captured BEFORE any
        // placement rows go, re-synced after the members are settled.
        java.util.Set<Long> placedIn = new java.util.LinkedHashSet<>();
        if (membershipChanged) {
            for (Question m : storedMembers) {
                for (QuestionnaireQuestion p : questionnaireQuestionRepository
                        .findByQuestionQuestionId(m.getQuestionId())) {
                    placedIn.add(p.getQuestionnaire().getQuestionnaireId());
                }
            }
        }
        // Writes. The parent first: heading, description, type — its options,
        // rows and scores are all empty by validation, and applyUpdate's
        // wipe-and-rewrite keeps a former MCQ's leftovers from surviving the
        // switch into a group.
        applyUpdate(parent, request, mqts);
        // Members no longer wanted go first — their placements before them
        // (the FK), and the membership guard proved none is answered.
        java.util.Set<Long> keptIds = new java.util.HashSet<>();
        for (QuestionRequest w : want) {
            if (w.questionId() != null) {
                keptIds.add(w.questionId());
            }
        }
        List<Question> removed = storedMembers.stream()
                .filter(m -> !keptIds.contains(m.getQuestionId())).toList();
        for (Question m : removed) {
            questionnaireQuestionRepository.deleteAll(
                    questionnaireQuestionRepository.findByQuestionQuestionId(m.getQuestionId()));
        }
        questionnaireQuestionRepository.flush();
        deleteMembers(removed);
        List<Question> finalMembers = new ArrayList<>();
        for (int i = 0; i < want.size(); i++) {
            QuestionRequest w = want.get(i);
            if (w.questionId() == null) {
                finalMembers.add(createMember(parent, w, i, mqts));
            } else {
                Question stored = storedById.get(w.questionId());
                applyUpdate(stored, w, mqts);
                stored.setGroupSortOrder(i);
                finalMembers.add(stored);
            }
        }
        for (Long questionnaireId : placedIn) {
            resyncGroupPlacements(questionnaireId, parent, finalMembers);
        }
        // The members are what questionnaires deliver, so each one's cached
        // content goes; the parent has no placements to evict for.
        for (Question m : storedMembers) {
            portalContentService.evictForQuestion(m.getQuestionId());
        }
        return ResponseEntity.ok(toResponse(parent));
    }

    /**
     * One questionnaire's placements brought back in step with the group's
     * NEW membership: the surviving run keeps its place and its per-member
     * optional flags, new members slot into it in group order (required, as
     * every new placement starts), the scope is renumbered dense and every
     * tag re-stamped — the same invariants the placement PUT writes. If no
     * old member survived in this questionnaire the group simply drops out
     * of it (there is no position left to splice into).
     */
    private void resyncGroupPlacements(Long questionnaireId, Question parent, List<Question> finalMembers) {
        List<QuestionnaireQuestion> all = questionnaireQuestionRepository.findInDisplayOrder(questionnaireId);
        Map<Long, QuestionnaireQuestion> runByQuestionId = new LinkedHashMap<>();
        for (QuestionnaireQuestion p : all) {
            Question pq = p.getQuestion().getParentQuestion();
            if (pq != null && pq.getQuestionId().equals(parent.getQuestionId())) {
                runByQuestionId.put(p.getQuestion().getQuestionId(), p);
            }
        }
        if (runByQuestionId.isEmpty()) {
            return;
        }
        QuestionnaireQuestion anchor = runByQuestionId.values().iterator().next();
        Long scopeSectionId = anchor.getSection() == null ? null : anchor.getSection().getSectionId();
        // The scope the run lives in, display-ordered: its section, or the
        // whole flat questionnaire. Spliced once, at the run's first row.
        List<QuestionnaireQuestion> newScope = new ArrayList<>();
        boolean spliced = false;
        for (QuestionnaireQuestion p : all) {
            Long sectionId = p.getSection() == null ? null : p.getSection().getSectionId();
            if (!Objects.equals(sectionId, scopeSectionId)) {
                continue;
            }
            if (runByQuestionId.containsKey(p.getQuestion().getQuestionId())) {
                if (!spliced) {
                    spliced = true;
                    for (Question m : finalMembers) {
                        QuestionnaireQuestion row = runByQuestionId.get(m.getQuestionId());
                        if (row == null) {
                            row = new QuestionnaireQuestion();
                            row.setQuestionnaire(anchor.getQuestionnaire());
                            row.setQuestion(m);
                            row.setSection(anchor.getSection());
                            row.setOptional(false);
                        }
                        newScope.add(row);
                    }
                }
                continue;
            }
            newScope.add(p);
        }
        for (int i = 0; i < newScope.size(); i++) {
            newScope.get(i).setSortOrder(i);
        }
        questionnaireQuestionRepository.saveAll(newScope);
        questionnaireQuestionRepository.flush();
        PlacementTags.assign(anchor.getQuestionnaire().isHasSections(),
                sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(questionnaireId),
                questionnaireQuestionRepository.findInDisplayOrder(questionnaireId));
        portalContentService.evict(questionnaireId);
    }

    /** The stored members of a group, in their authored order. */
    private List<Question> membersOf(Question parent) {
        return questionRepository
                .findByParentQuestionQuestionIdOrderByGroupSortOrderAscQuestionIdAsc(parent.getQuestionId());
    }

    /** The payload's member list, never null. */
    private List<QuestionRequest> membersOf(QuestionRequest request) {
        return request.members() == null ? List.of()
                : request.members().stream().filter(Objects::nonNull).toList();
    }

    /** Scoring rows first, then the member rows take their options along by cascade. */
    private void deleteMembers(List<Question> members) {
        if (members.isEmpty()) {
            return;
        }
        for (Question m : members) {
            optionMqtScoreRepository.deleteByOptionQuestionQuestionId(m.getQuestionId());
            questionMqtScoreRepository.deleteByQuestionQuestionId(m.getQuestionId());
            questionRowMqtRepository.deleteByQuestionRowQuestionQuestionId(m.getQuestionId());
        }
        optionMqtScoreRepository.flush();
        questionRowMqtRepository.flush();
        questionRepository.deleteAll(members);
        questionRepository.flush();
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteQuestion(@PathVariable Long id) {
        Question question = questionRepository.findById(id).orElse(null);
        if (question == null) {
            return ResponseEntity.notFound().build();
        }
        String reason = deleteBlockedReason(question);
        if (reason != null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", reason));
        }
        deleteOne(question);
        return ResponseEntity.noContent().build();
    }

    /**
     * Why this question may not be deleted — null when it may. A GROUP's
     * answers and placements live on its MEMBERS (the parent is never placed
     * or answered), so the parent is blocked exactly when a member would be;
     * a member alone is never deletable, its group's payload is where it dies.
     */
    private String deleteBlockedReason(Question question) {
        if (question.isGroupMember()) {
            return "This question belongs to a group — edit the group to remove it";
        }
        List<Question> toCheck = question.isGroup() ? membersOf(question) : List.of(question);
        for (Question q : toCheck) {
            if (assessmentAnswerRepository.existsByQuestionQuestionId(q.getQuestionId())) {
                return "This question has responses and cannot be deleted";
            }
            if (questionnaireQuestionRepository.existsByQuestionQuestionId(q.getQuestionId())) {
                return "This question is used in a questionnaire — remove it there first";
            }
        }
        return null;
    }

    /** The checked delete: members first on a group, then the question itself. */
    private void deleteOne(Question question) {
        if (question.isGroup()) {
            deleteMembers(membersOf(question));
        }
        Long id = question.getQuestionId();
        // Scoring rows belong to the question — they go first, then the
        // question takes its options AND rows with it via cascade.
        optionMqtScoreRepository.deleteByOptionQuestionQuestionId(id);
        questionMqtScoreRepository.deleteByQuestionQuestionId(id);
        questionRowMqtRepository.deleteByQuestionRowQuestionQuestionId(id);
        optionMqtScoreRepository.flush();
        questionRowMqtRepository.flush();
        questionRepository.delete(question);
    }

    /**
     * Delete several questions at once. Same two refusals as the single
     * delete, checked for EVERY id before anything is removed: a selection
     * that contains one frozen question deletes nothing and says which, so
     * the author can drop it and repeat. Unknown ids are refused the same
     * way rather than ignored — a selection referring to something that is
     * already gone is a stale page, worth knowing about.
     */
    @PostMapping("/bulk-delete")
    public ResponseEntity<?> bulkDeleteQuestions(@Valid @RequestBody QuestionBulkDeleteRequest request) {
        List<Long> ids = request.questionIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "select at least one question"));
        }

        // Pass 1 — nothing is written until every id has been checked.
        List<Map<String, Object>> blocked = new ArrayList<>();
        List<Question> questions = new ArrayList<>();
        for (Long id : ids) {
            Question question = questionRepository.findById(id).orElse(null);
            String reason = question == null
                    ? "This question no longer exists — refresh the page"
                    : deleteBlockedReason(question);
            if (reason != null) {
                blocked.add(Map.of("questionId", id, "message", reason));
            } else {
                questions.add(question);
            }
        }
        if (!blocked.isEmpty()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "message", blocked.size() + " of the " + ids.size()
                            + " selected questions cannot be deleted — nothing was deleted",
                    "blocked", blocked));
        }

        // Pass 2 — the checked delete per question: a group goes with its
        // members, scoring rows first, then options and rows by cascade,
        // exactly as the single delete does.
        for (Question question : questions) {
            deleteOne(question);
        }
        return ResponseEntity.ok(Map.of("deleted", ids.size()));
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
        List<QuestionOptionResponse> options = q.choiceOptions().stream()
                .map(o -> QuestionOptionResponse.from(o, byOption.getOrDefault(o.getOptionId(), List.of())))
                .toList();
        Map<Long, List<MqtScoreResponse>> byRow = questionRowMqtRepository
                .findByQuestionRowQuestionQuestionId(q.getQuestionId()).stream()
                .collect(Collectors.groupingBy(m -> m.getQuestionRow().getQuestionRowId(),
                        Collectors.mapping(m -> toScore(m.getMeasuredQualityType(), m.getScore()),
                                Collectors.toList())));
        List<QuestionRowResponse> rows = q.getRows().stream()
                .map(r -> QuestionRowResponse.from(r, byRow.getOrDefault(r.getQuestionRowId(), List.of())))
                .toList();
        // A GROUP parent is never placed — where it is "used" is where its
        // members are, and they are always placed together, so the first
        // member's placements speak for the group.
        List<Question> members = q.isGroup() ? membersOf(q) : List.of();
        Long usedInSourceId = q.isGroup()
                ? (members.isEmpty() ? null : members.get(0).getQuestionId())
                : q.getQuestionId();
        List<QuestionResponse.UsedInRef> usedIn = usedInSourceId == null ? List.of()
                : questionnaireQuestionRepository
                        .findByQuestionQuestionId(usedInSourceId).stream()
                        .map(m -> new QuestionResponse.UsedInRef(
                                m.getQuestionnaire().getQuestionnaireId(), m.getQuestionnaire().getName()))
                        .toList();
        return QuestionResponse.from(q, usedIn,
                placement == null || placement.getSection() == null ? null : placement.getSection().getSectionId(),
                placement == null ? null : placement.getSortOrder(),
                placement == null ? null : placement.getQuestionTag(),
                placement == null ? null : placement.isOptional(),
                options, rows, questionScores,
                members.stream().map(this::toResponse).toList());
    }

    private MqtScoreResponse toScore(MeasuredQualityType mqt, double score) {
        return new MqtScoreResponse(mqt.getMeasuredQualityTypeId(), mqt.getName(), score);
    }

    // ── Scoring writes ────────────────────────────────────────────────────

    /**
     * Resolves every MQT id referenced anywhere in the payload. Returns null
     * when an id does not exist (caller 400s).
     */
    private Map<Long, MeasuredQualityType> resolveMqts(QuestionRequest request) {
        return resolveMqts(request, Map.of());
    }

    /**
     * As above, but with types that exist only inside this transaction seeded
     * in — the import endpoint's freshly created nodes, keyed by the NEGATIVE
     * ref the payload used for them. Seeded first, so a pending id never
     * reaches the repository and a real id never resolves to a pending node.
     */
    private Map<Long, MeasuredQualityType> resolveMqts(QuestionRequest request,
            Map<Long, MeasuredQualityType> pending) {
        var ids = referencedMqtIds(request);
        Map<Long, MeasuredQualityType> found = new LinkedHashMap<>();
        var lookup = new java.util.LinkedHashSet<Long>();
        for (Long id : ids) {
            MeasuredQualityType seeded = pending.get(id);
            if (seeded != null) {
                found.put(id, seeded);
            } else {
                lookup.add(id);
            }
        }
        measuredQualityTypeRepository.findAllById(lookup)
                .forEach(m -> found.put(m.getMeasuredQualityTypeId(), m));
        return found.keySet().containsAll(ids) ? found : null;
    }

    /** Every MQT this payload points at, from all three levels it can point from. */
    private java.util.LinkedHashSet<Long> referencedMqtIds(QuestionRequest request) {
        var ids = new java.util.LinkedHashSet<Long>();
        dedupe(request.mqtScores()).keySet().forEach(ids::add);
        for (QuestionOptionRequest o : desiredOptions(request)) {
            dedupe(o.mqtScores()).keySet().forEach(ids::add);
        }
        // Grid rows score MQTs of their own — a third level, and just as
        // able to reference an id that does not exist.
        for (QuestionRowRequest r : sanitizedRows(request)) {
            dedupe(r.mqtScores()).keySet().forEach(ids::add);
        }
        // A GROUP's members score like standalone questions, so their
        // references resolve with the parent's in one map.
        if (typeOf(request) == QuestionType.GROUP) {
            for (QuestionRequest member : membersOf(request)) {
                ids.addAll(referencedMqtIds(member));
            }
        }
        return ids;
    }

    private void writeScores(Question question, QuestionRequest request, Map<Long, MeasuredQualityType> mqts) {
        boolean scale = typeOf(request) == QuestionType.LINEAR_SCALE;
        for (Map.Entry<Long, Double> e : dedupe(request.mqtScores()).entrySet()) {
            QuestionMqtScore row = new QuestionMqtScore();
            row.setQuestion(question);
            row.setMeasuredQualityType(mqts.get(e.getKey()));
            // On a LINEAR_SCALE the question-level row NOMINATES an MQT and
            // contributes nothing flat of its own — the point the respondent
            // picks is the score, and it is carried by the generated option
            // rows (see desiredOptions). Stored as 0 rather than trusting the
            // payload, so the nomination can never read as a flat score.
            row.setScore(scale ? 0d : e.getValue());
            questionMqtScoreRepository.save(row);
        }
        // Options in the entity list line up index-for-index with the
        // effective payload — rebuildOptions built them from the same list.
        List<QuestionOptionRequest> want = desiredOptions(request);
        List<Option> have = question.getOptions();
        for (int i = 0; i < want.size() && i < have.size(); i++) {
            for (Map.Entry<Long, Double> e : dedupe(want.get(i).mqtScores()).entrySet()) {
                OptionMqtScore row = new OptionMqtScore();
                row.setOption(have.get(i));
                row.setMeasuredQualityType(mqts.get(e.getKey()));
                row.setScore(e.getValue());
                optionMqtScoreRepository.save(row);
            }
        }
        // Grid rows: what answering the item is worth, per MQT — the row's
        // own score, like an option's, earned whatever column is picked. Rows
        // line up index-for-index with the sanitized payload for the same
        // reason options do; sanitizedRows already deduped and rounded.
        List<QuestionRowRequest> wantRows = sanitizedRows(request);
        List<QuestionRow> haveRows = question.getRows();
        for (int i = 0; i < wantRows.size() && i < haveRows.size(); i++) {
            for (MqtScoreRequest s : wantRows.get(i).mqtScores()) {
                QuestionRowMqt row = new QuestionRowMqt();
                row.setQuestionRow(haveRows.get(i));
                row.setMeasuredQualityType(mqts.get(s.measuredQualityTypeId()));
                row.setScore(s.score());
                questionRowMqtRepository.save(row);
            }
        }
    }

    /**
     * Last entry wins when the same MQT appears twice; order preserved.
     *
     * <p>The ONE place a submitted score is rounded to the 2 decimals the
     * column stores. Every write goes through here — question level, option
     * level and the generated scale points — so the editor, the bulk sheet and
     * the freeze comparison cannot disagree about what was saved.
     */
    private Map<Long, Double> dedupe(List<MqtScoreRequest> scores) {
        Map<Long, Double> out = new LinkedHashMap<>();
        if (scores != null) {
            for (MqtScoreRequest s : scores) {
                if (s != null && s.measuredQualityTypeId() != null) {
                    out.put(s.measuredQualityTypeId(), round(s.score()));
                }
            }
        }
        return out;
    }

    /** 2 decimals, the precision the score column holds. */
    private static double round(double value) {
        return Math.round(value * 100d) / 100d;
    }

    private ResponseEntity<Map<String, String>> unknownMqt() {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "One of the referenced MQTs does not exist"));
    }

    // ── Fields & options ──────────────────────────────────────────────────

    private void applyFields(Question question, QuestionRequest request) {
        question.setContentType(request.contentType() == null ? ContentType.TEXT : request.contentType());
        question.setQuestionType(typeOf(request));
        // Null only ever on a GROUP, the one type whose stem (its heading)
        // may be blank — validateType holds the line for every other type.
        question.setQuestionTexString(trimmedOrNull(request.stem()));
        // Blank → null so "no description" has exactly one representation on
        // file, and nothing downstream has to test for both.
        question.setDescription(trimmedOrNull(request.description()));
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
        // Resolved like the range: TEXT is written down on every short
        // answer, and switching away from SHORT_ANSWER clears it.
        question.setAnswerFormat(answerFormatOf(request));
    }

    /** MCQ whenever the payload does not say — what every pre-type caller means. */
    private QuestionType typeOf(QuestionRequest request) {
        return request.questionType() == null ? QuestionType.MCQ : request.questionType();
    }

    /** The format as it will be STORED: TEXT when a short answer does not say, null on every other type. */
    private AnswerFormat answerFormatOf(QuestionRequest request) {
        if (typeOf(request) != QuestionType.SHORT_ANSWER) {
            return null;
        }
        return request.answerFormat() == null ? AnswerFormat.TEXT : request.answerFormat();
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
                    || !Objects.equals(w.mediaUrl(), h.getMediaUrl())
                    // The game is part of a game option's identity: swapping it
                    // is a different option (and frozen once answered), keeping
                    // it is no change at all.
                    || !Objects.equals(i == 0 ? desiredGameId(request) : null, gameIdOf(h))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Copy descriptions onto the option rows already on file, positionally.
     *
     * <p>Only ever called when {@link #optionsChanged} said no, which means the
     * two lists are the same length and line up index for index — the same
     * pairing that comparison used. Nothing is created, deleted or reordered,
     * so an answered question keeps every optionId it had.
     *
     * <p>A LINEAR_SCALE's options are generated rather than authored, so the
     * payload has nothing to copy from; desiredOptions returns the generated
     * points, whose descriptions are always null, and this writes null over
     * null.
     */
    private void syncOptionDescriptions(Question question, QuestionRequest request) {
        List<QuestionOptionRequest> want = desiredOptions(request);
        List<Option> have = question.getOptions();
        for (int i = 0; i < want.size() && i < have.size(); i++) {
            have.get(i).setDescription(trimmedOrNull(want.get(i).description()));
        }
    }

    /** Replaces the option set; list order becomes sortOrder. */
    private void rebuildOptions(Question question, QuestionRequest request) {
        question.getOptions().clear();
        List<QuestionOptionRequest> want = desiredOptions(request);
        // A GAMES question's one generated option is the game. Validated
        // before any write (gameProblem), so a miss here is a race — thrown,
        // which rolls the whole write back rather than storing a game question
        // with no game.
        Game game = desiredGameId(request) == null ? null
                : gameRepository.findById(desiredGameId(request))
                        .orElseThrow(() -> conflict("the chosen game no longer exists"));
        for (int i = 0; i < want.size(); i++) {
            QuestionOptionRequest w = want.get(i);
            Option option = new Option();
            option.setOptionText(w.optionText());
            option.setDescription(trimmedOrNull(w.description()));
            option.setContentType(contentTypeOf(w));
            option.setMediaUrl(w.mediaUrl());
            option.setSortOrder(i);
            option.setGame(i == 0 ? game : null);
            question.addOption(option);
        }
    }

    /** The game the payload's one option is to launch — GAMES only, null on every other type. */
    private Long desiredGameId(QuestionRequest request) {
        return typeOf(request) == QuestionType.GAMES ? request.gameId() : null;
    }

    /** The game a stored question launches, if any. */
    private static Long gameIdOf(Option option) {
        return option.getGame() == null ? null : option.getGame().getGameId();
    }

    /**
     * GAMES only, the half of the game rules that needs the database — null
     * when fine, else the message (a 400). The game must exist and be offered
     * (active), EXCEPT when it is the game this question already launches:
     * retiring a game withdraws it from new questions, never from the ones
     * built on it, so editing such a question's stem must still save.
     * {@code current} is null on a create.
     */
    private String gameProblem(QuestionRequest request, Question current) {
        Long gameId = desiredGameId(request);
        if (gameId == null) {
            return null;
        }
        Game game = gameRepository.findById(gameId).orElse(null);
        if (game == null) {
            return "game " + gameId + " does not exist";
        }
        boolean alreadyHere = current != null
                && current.getOptions().stream().anyMatch(o -> gameId.equals(gameIdOf(o)));
        if (!game.isActive() && !alreadyHere) {
            return "the game \"" + game.getName() + "\" is retired — pick an active game";
        }
        return null;
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
     * like an MCQ. SHORT_ANSWER (V40, 2026-10-06): exactly ONE generated
     * option, FREE_TEXT with no label, whatever the caller sent — the slot the
     * typed answer is stored on, so the answer row carries an optionId like
     * every other answer (Data Studio and the reports). It is never authored
     * and never shown: Question.choiceOptions hides it from every payload that
     * lists options, and validateType still refuses options in a short-answer
     * payload. Generated identically on every save, so the freeze comparison
     * sees no change and an answered short answer stays editable.
     */
    private List<QuestionOptionRequest> desiredOptions(QuestionRequest request) {
        QuestionType type = typeOf(request);
        if (type == QuestionType.GROUP) {
            // The parent is a heading; the options live on its members, each
            // of which goes through this method as its own request.
            return List.of();
        }
        if (type == QuestionType.SHORT_ANSWER) {
            return List.of(new QuestionOptionRequest(null, null, ContentType.FREE_TEXT, null, List.of()));
        }
        if (type == QuestionType.GAMES) {
            // V42: exactly ONE generated option, whatever the caller sent — the
            // one the game launches. No label (the portal names it by its game)
            // and no scores of its own. The game link itself is not part of
            // QuestionOptionRequest: rebuildOptions attaches it from gameId,
            // and optionsChanged compares it, so a game swap is a change and
            // the same game is not.
            return List.of(new QuestionOptionRequest(null, null, ContentType.TEXT, null, List.of()));
        }
        if (type == QuestionType.PARAGRAPH) {
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
                    // A scale's points are generated, not authored, so there is
                    // nothing to carry a description for — the captions under
                    // the ends are scaleLowLabel/scaleHighLabel instead.
                    null,
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
        // A GROUP's heading is optional; every other stem is the question and
        // must exist. Used to be @NotBlank on the DTO — it lives here now so
        // the one exception does not loosen the rule for everyone.
        if (type != QuestionType.GROUP && (request.stem() == null || request.stem().isBlank())) {
            return "stem is required";
        }
        // FREE_TEXT is an OPTION kind — the "Other…" row. A stem "made of" a
        // text box means nothing, and `question.content_type` in MySQL was
        // deliberately not widened for it (V36), so this is the guard.
        if (request.contentType() == ContentType.FREE_TEXT) {
            return "a question stem cannot be a short-answer box — FREE_TEXT is an option type";
        }
        // Only a game question names a game: on any other type the id would be
        // silently dropped, and the caller would believe it was stored.
        if (type != QuestionType.GAMES && request.gameId() != null) {
            return "gameId is only for a game question (questionType GAMES)";
        }
        // Same reasoning: a format on anything but a typed answer would be
        // dropped, and nothing would check the answers against it.
        if (type != QuestionType.SHORT_ANSWER && request.answerFormat() != null) {
            return "answerFormat is only for a short answer (questionType SHORT_ANSWER)";
        }
        // And again: member questions anywhere but on a group would be
        // silently dropped.
        if (type != QuestionType.GROUP && !membersOf(request).isEmpty()) {
            return "members is only for a group question (questionType GROUP)";
        }
        if (type == QuestionType.GROUP) {
            return validateGroup(request);
        }
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
            // screen honours. The one option it does store is generated by
            // desiredOptions, never sent by a caller.
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
        if (type == QuestionType.GAMES) {
            // One option, generated from gameId — nothing else to author. The
            // game itself (exists, active) needs the database and is checked
            // by gameProblem, next to this. Any number of questions may launch
            // the same game (V43).
            if (request.gameId() == null) {
                return "a game question needs a game — send its gameId";
            }
            if (request.selectionRule() != null || request.selectionCount() != null) {
                return "a game question has one option — it cannot have a selection rule";
            }
            if (Boolean.TRUE.equals(request.shuffleOptions())) {
                return "a game question has one option — there is nothing to shuffle";
            }
            if (!sanitized(request.options()).isEmpty()) {
                return "a game question's option is generated from its game — send gameId, not options";
            }
            if (request.rows() != null && !request.rows().isEmpty()) {
                return "a game question has no rows";
            }
            return null;
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
            // The columns are one shared scale for every row — an "Other…"
            // column would mean a text box per row, which no screen draws.
            if (desiredOptions(request).stream().anyMatch(o -> contentTypeOf(o) == ContentType.FREE_TEXT)) {
                return "a grid's columns are a shared rating scale — none of them can be a short-answer box";
            }
            return null;
        }
        // MCQ. A placement is required unless the questionnaire marks it
        // optional (SelectionBounds' floor is never 0), so one with nothing
        // to pick would stop every respondent at it for good. A mistyped option header in an upload sheet was
        // enough to produce one.
        List<QuestionOptionRequest> options = desiredOptions(request);
        if (options.isEmpty()) {
            return "a multiple-choice question needs at least one option";
        }
        // The only type that may carry an "Other…" option.
        return validateFreeTextOptions(options);
    }

    /**
     * A GROUP's own rules — null when fine, else the message. The parent is
     * a heading and nothing else: no options, rows, scores, rule or shuffle
     * of its own, all refused rather than dropped so no caller can believe
     * they were stored. The members are the content — at least two (one
     * member is just a question), each a full request held to exactly the
     * per-type rules a standalone question passes, recursively. GAMES
     * (fullscreen launch), LIKERT_GRID (a grid inside the group block) and
     * GROUP (no nesting) may not be members.
     */
    private String validateGroup(QuestionRequest request) {
        if (request.selectionRule() != null || request.selectionCount() != null) {
            return "a group is a heading over its questions — it cannot have a selection rule";
        }
        if (Boolean.TRUE.equals(request.shuffleOptions())) {
            return "a group has no options of its own to shuffle";
        }
        if (!sanitized(request.options()).isEmpty()) {
            return "a group has no options of its own — options belong to its questions";
        }
        if (request.rows() != null && !request.rows().isEmpty()) {
            return "a group has no rows";
        }
        if (request.mqtScores() != null && !request.mqtScores().isEmpty()) {
            return "a group carries no scores of its own — scores belong to its questions";
        }
        List<QuestionRequest> members = membersOf(request);
        if (members.size() < 2) {
            return "a group needs at least two questions";
        }
        for (int i = 0; i < members.size(); i++) {
            QuestionRequest member = members.get(i);
            QuestionType memberType = typeOf(member);
            String where = "question " + (i + 1) + " in the group: ";
            if (memberType == QuestionType.GROUP) {
                return where + "a group cannot contain another group";
            }
            if (memberType == QuestionType.GAMES) {
                return where + "a game question cannot be inside a group";
            }
            if (memberType == QuestionType.LIKERT_GRID) {
                return where + "a grid cannot be inside a group";
            }
            String problem = firstProblem(member);
            if (problem != null) {
                return where + problem;
            }
        }
        return null;
    }

    /**
     * The "Other…" option's rules, MCQ only — null when fine, else the
     * message. At most ONE per question (two "Other" rows is a design nobody
     * wants and one is what every downstream screen assumes), its text is
     * the LABEL on the button so it is required, and it has no media: the
     * box is what it is made of.
     */
    private String validateFreeTextOptions(List<QuestionOptionRequest> options) {
        int freeText = 0;
        for (QuestionOptionRequest o : options) {
            if (contentTypeOf(o) != ContentType.FREE_TEXT) {
                continue;
            }
            freeText++;
            if (o.optionText() == null) {
                return "the short-answer option needs a label (e.g. \"Other\")";
            }
            if (o.mediaUrl() != null) {
                return "the short-answer option is a text box — it cannot carry a media URL";
            }
        }
        return freeText > 1 ? "a question can have only one short-answer option" : null;
    }

    /**
     * The grid rows this payload actually means — trimmed text, MQT scores
     * deduped and rounded through {@link #dedupe} (the ONE place a score is
     * rounded, so the write, the response and the freeze comparison agree),
     * and empty for every type but LIKERT_GRID so switching a grid to another
     * type drops its rows instead of leaving them to be delivered by a screen
     * that has no idea what to do with them.
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
                        dedupe(r.mqtScores()).entrySet().stream()
                                .map(e -> new MqtScoreRequest(e.getKey(), e.getValue()))
                                .toList()))
                .filter(r -> r.rowText() != null || !r.mqtScores().isEmpty())
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
                        // A description alone never keeps an option alive — the
                        // filter above still drops a row with no text and no
                        // media, because help text under nothing is nothing.
                        trimmedOrNull(o.description()),
                        contentTypeOf(o),
                        o.mediaUrl() == null || o.mediaUrl().isBlank() ? null : o.mediaUrl().trim(),
                        o.mqtScores()))
                .toList();
    }

    private ContentType contentTypeOf(QuestionOptionRequest o) {
        return o.contentType() == null ? ContentType.TEXT : o.contentType();
    }
}
