package com.bodhpsychometric.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalAssessmentDetailResponse;
import com.bodhpsychometric.dto.PortalAttemptStatusResponse;
import com.bodhpsychometric.dto.PortalBeginRequest;
import com.bodhpsychometric.dto.PortalSubmitRequest;
import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.demographics.DemographicField;
import com.bodhpsychometric.model.demographics.DemographicResponse;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.question.SelectionBounds;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.model.questionnaire.Section;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;

/**
 * The respondent take flow, end to end: fetch the attempt's content, begin it
 * (demographic form + consent + NOT_STARTED → ONGOING), submit it (all
 * answers, all-or-nothing, ONGOING → COMPLETED). Every entry point runs the
 * attempt gate: the caller's token must belong to the respondent who owns the
 * attempt, and the assessment must be ACTIVE. COMPLETED is the only frozen
 * state — un-completed attempts may be re-begun (demographics are replaced)
 * and may be unmapped by the dashboard.
 */
@Service
public class PortalAssessmentService {

    private final PortalAuthService auth;
    private final RespondentAssessmentMappingRepository mappings;
    private final QuestionnaireQuestionRepository placements;
    private final QuestionnaireDemographicFieldRepository demographicMappings;
    private final DemographicResponseRepository demographicResponses;
    private final AssessmentAnswerRepository assessmentAnswers;

    public PortalAssessmentService(PortalAuthService auth,
            RespondentAssessmentMappingRepository mappings,
            QuestionnaireQuestionRepository placements,
            QuestionnaireDemographicFieldRepository demographicMappings,
            DemographicResponseRepository demographicResponses,
            AssessmentAnswerRepository assessmentAnswers) {
        this.auth = auth;
        this.mappings = mappings;
        this.placements = placements;
        this.demographicMappings = demographicMappings;
        this.demographicResponses = demographicResponses;
        this.assessmentAnswers = assessmentAnswers;
    }

    /** Everything the portal renders for one attempt — see PortalAssessmentDetailResponse. */
    @Transactional(readOnly = true)
    public PortalAssessmentDetailResponse getDetail(String authorizationHeader, Long mappingId) {
        RespondentAssessmentMapping mapping = requireOwnAttempt(authorizationHeader, mappingId);
        Long questionnaireId = mapping.getAssessment().getQuestionnaire().getQuestionnaireId();
        return PortalAssessmentDetailResponse.from(mapping,
                placements.findForPortalDelivery(questionnaireId),
                demographicMappings.findForPortalDelivery(questionnaireId));
    }

    /**
     * Starts the attempt: validates and stores the demographic form
     * (replace-all, so a re-launch simply re-enters it), records T&C consent
     * on the respondent profile, and flips NOT_STARTED → ONGOING.
     */
    @Transactional
    public PortalAttemptStatusResponse begin(String authorizationHeader, Long mappingId,
            PortalBeginRequest request) {
        RespondentAssessmentMapping mapping = requireOwnAttempt(authorizationHeader, mappingId);
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED) {
            throw conflict("This assessment has already been submitted");
        }

        List<PortalBeginRequest.DemographicEntry> entries =
                request == null || request.demographics() == null ? List.of() : request.demographics();

        Long questionnaireId = mapping.getAssessment().getQuestionnaire().getQuestionnaireId();
        List<QuestionnaireDemographicField> mapped = demographicMappings.findForPortalDelivery(questionnaireId);
        Map<Long, QuestionnaireDemographicField> byFieldId = mapped.stream().collect(Collectors.toMap(
                qdf -> qdf.getDemographicField().getDemographicFieldId(), qdf -> qdf,
                (a, b) -> a, LinkedHashMap::new));

        // Pass 1 — validate every entry before writing anything.
        Map<Long, String> values = new LinkedHashMap<>();
        for (PortalBeginRequest.DemographicEntry entry : entries) {
            if (entry.demographicFieldId() == null || entry.value() == null || entry.value().isBlank()) {
                throw badRequest("Each demographic entry needs a demographicFieldId and a non-blank value");
            }
            QuestionnaireDemographicField qdf = byFieldId.get(entry.demographicFieldId());
            if (qdf == null) {
                throw badRequest("Demographic field " + entry.demographicFieldId()
                        + " is not part of this questionnaire's form");
            }
            if (values.containsKey(entry.demographicFieldId())) {
                throw badRequest("Duplicate value for demographic field " + entry.demographicFieldId());
            }
            String value = entry.value().trim();
            DemographicField field = qdf.getDemographicField();
            switch (field.getFieldType()) {
                case NUMBER -> {
                    try {
                        Double.parseDouble(value);
                    } catch (NumberFormatException e) {
                        throw badRequest("\"" + field.getLabel() + "\" must be a number");
                    }
                }
                case DATE -> {
                    try {
                        LocalDate.parse(value);
                    } catch (DateTimeParseException e) {
                        throw badRequest("\"" + field.getLabel() + "\" must be a date (yyyy-MM-dd)");
                    }
                }
                case DROPDOWN -> {
                    if (!field.getOptions().contains(value)) {
                        throw badRequest("\"" + value + "\" is not one of \"" + field.getLabel() + "\"'s choices");
                    }
                }
                default -> { /* TEXT — anything non-blank */ }
            }
            values.put(entry.demographicFieldId(), value);
        }

        List<String> missing = mapped.stream()
                .filter(QuestionnaireDemographicField::isRequired)
                .filter(qdf -> !values.containsKey(qdf.getDemographicField().getDemographicFieldId()))
                .map(qdf -> qdf.getDemographicField().getLabel())
                .toList();
        if (!missing.isEmpty()) {
            throw badRequest("Required demographic fields missing: " + String.join(", ", missing));
        }

        // Pass 2 — replace-all write of the pair's demographic set. Flush the
        // deletes before inserting, or Hibernate orders the inserts first and
        // trips the unique tuple when the form is re-entered.
        demographicResponses.deleteByRespondent_IdAndAssessment_AssessmentId(
                mapping.getRespondent().getId(), mapping.getAssessment().getAssessmentId());
        demographicResponses.flush();
        for (Map.Entry<Long, String> e : values.entrySet()) {
            DemographicResponse row = new DemographicResponse();
            row.setRespondent(mapping.getRespondent());
            row.setAssessment(mapping.getAssessment());
            row.setDemographicField(byFieldId.get(e.getKey()).getDemographicField());
            row.setResponseValue(e.getValue());
            demographicResponses.save(row);
        }

        RespondentUser respondent = mapping.getRespondent();
        if (mapping.getAssessment().isShowTermsAndConditions() && !respondent.isConsented()) {
            respondent.setConsented(true);
            respondent.setConsentedAt(OffsetDateTime.now());
        }

        mapping.setAssessmentStatus(RespondentAssessmentStatus.ONGOING);
        return PortalAttemptStatusResponse.from(mappings.save(mapping));
    }

    /**
     * The submission: one answer per placed question, every option verified
     * to belong to its question, all-or-nothing, then ONGOING → COMPLETED.
     * The answer set belongs to the (respondent, assessment) pair, not the
     * attempt — a granted re-attempt REPLACES the pair's previous set
     * (latest wins, no longitudinal copies). Within one attempt the
     * COMPLETED gate still makes submission once-and-for-all.
     */
    @Transactional
    public PortalAttemptStatusResponse submit(String authorizationHeader, Long mappingId,
            PortalSubmitRequest request) {
        RespondentAssessmentMapping mapping = requireOwnAttempt(authorizationHeader, mappingId);
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED) {
            throw conflict("This assessment has already been submitted");
        }
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.NOT_STARTED) {
            throw conflict("Begin the attempt before submitting answers");
        }

        Long questionnaireId = mapping.getAssessment().getQuestionnaire().getQuestionnaireId();
        // Delivery order, which is also NUMBERING order — see navigatorLabels.
        // The option fetch join repeats each placement, and entity identity
        // makes distinct() collapse the repeats without disturbing the order.
        List<QuestionnaireQuestion> delivered = placements.findForPortalDelivery(questionnaireId).stream()
                .distinct().toList();
        Map<Long, Question> questionsById = delivered.stream()
                .collect(Collectors.toMap(p -> p.getQuestion().getQuestionId(),
                        p -> p.getQuestion(), (a, b) -> a, LinkedHashMap::new));
        // What to CALL a question when a message has to point the respondent
        // back at one. Never its id — that names nothing they can see.
        Map<Long, String> labels = navigatorLabels(delivered);
        if (questionsById.isEmpty()) {
            throw conflict("This assessment has no questions yet");
        }

        List<PortalSubmitRequest.AnswerEntry> entries =
                request == null || request.answers() == null ? List.of() : request.answers();

        // Pass 1 — validate every answer before writing anything. Two rules
        // the schema cannot express: the option must belong to the question
        // on the same entry, and so must the grid row.
        //
        // One entry per SELECTED OPTION, so a multi-select question appears
        // several times — the payload is isomorphic to the AssessmentAnswer
        // rows it becomes. The set dedupes a repeated (question, row, option)
        // triple silently, and that is load-bearing rather than tidy: two
        // identical rows violate uqAaRespondentAssessmentQuestionRowOption,
        // and a constraint violation inside this transaction marks it
        // rollback-only — a 500 at commit instead of the clean 400 below.
        //
        // Answers are collected per SLOT, not per question: a grid is one
        // question with one slot per row, everything else is one question
        // with a single null-row slot. Every rule below then reads the same
        // for both, and SelectionBounds is applied per row for free.
        //
        // Free text is the exception the option map cannot hold, so it gets
        // its own: SHORT_ANSWER has no options at all, and one entry IS the
        // whole answer.
        Map<AnswerSlot, Set<Option>> chosen = new LinkedHashMap<>();
        Map<Long, String> typed = new LinkedHashMap<>();
        for (PortalSubmitRequest.AnswerEntry entry : entries) {
            if (entry.questionId() == null) {
                throw badRequest("Each answer needs a questionId");
            }
            Question question = questionsById.get(entry.questionId());
            if (question == null) {
                throw badRequest("Question " + entry.questionId() + " is not part of this assessment");
            }
            if (question.getQuestionType() == QuestionType.SHORT_ANSWER) {
                if (entry.optionId() != null || entry.questionRowId() != null) {
                    throw badRequest("Question " + entry.questionId()
                            + " is a short answer — it takes answerText, not an option");
                }
                if (entry.answerText() == null || entry.answerText().isBlank()) {
                    throw badRequest("Question " + entry.questionId() + " needs a written answer");
                }
                String text = entry.answerText().trim();
                // TEXT holds 65 535 BYTES, not characters. Refused rather
                // than truncated: half an answer stored silently is worse
                // than a submission the respondent can fix.
                if (text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_ANSWER_TEXT_BYTES) {
                    throw badRequest("The answer to question " + entry.questionId() + " is too long");
                }
                // A second entry for one question would be an overwrite the
                // respondent never sees; the option path treats a repeat as a
                // duplicate too, it just dedupes rather than rejecting.
                if (typed.putIfAbsent(entry.questionId(), text) != null) {
                    throw badRequest("Question " + entry.questionId() + " was answered twice");
                }
                continue;
            }
            if (entry.answerText() != null) {
                throw badRequest("Question " + entry.questionId()
                        + " is answered by picking an option, not by typing");
            }
            if (entry.optionId() == null) {
                throw badRequest("Each answer needs a questionId and an optionId");
            }
            Option option = question.getOptions().stream()
                    .filter(o -> o.getOptionId().equals(entry.optionId()))
                    .findFirst().orElse(null);
            if (option == null) {
                throw badRequest("Option " + entry.optionId() + " does not belong to question "
                        + entry.questionId());
            }
            boolean isGrid = question.getQuestionType() == QuestionType.LIKERT_GRID;
            if (isGrid && entry.questionRowId() == null) {
                throw badRequest("Question " + entry.questionId()
                        + " is a grid — every answer needs the questionRowId it belongs to");
            }
            if (!isGrid && entry.questionRowId() != null) {
                throw badRequest("Question " + entry.questionId()
                        + " has no rows — questionRowId must be omitted");
            }
            if (isGrid && question.getRows().stream()
                    .noneMatch(r -> r.getQuestionRowId().equals(entry.questionRowId()))) {
                throw badRequest("Row " + entry.questionRowId() + " does not belong to question "
                        + entry.questionId());
            }
            chosen.computeIfAbsent(new AnswerSlot(entry.questionId(), entry.questionRowId()),
                    k -> new LinkedHashSet<>()).add(option);
        }

        // Every placed question still has to be answered — and every ROW of
        // every grid, which is what makes a half-filled grid a 400 rather
        // than a quietly incomplete answer set. A slot with no selections
        // never entered the map, so the floor of 1 that every rule shares
        // needs no separate check.
        //
        // Named the way the respondent's question index names them, and a SET
        // so a grid missing three rows is reported once, as the one question
        // they have to go back to.
        Set<String> unanswered = new LinkedHashSet<>();
        for (Question question : questionsById.values()) {
            // A short answer fills no slot — its answer is text, and it is
            // present or it is not.
            if (question.getQuestionType() == QuestionType.SHORT_ANSWER) {
                if (!typed.containsKey(question.getQuestionId())) {
                    unanswered.add(labels.get(question.getQuestionId()));
                }
                continue;
            }
            for (AnswerSlot slot : slotsOf(question)) {
                if (!chosen.containsKey(slot)) {
                    unanswered.add(labels.get(slot.questionId()));
                }
            }
        }
        if (!unanswered.isEmpty()) {
            throw badRequest(unanswered.size() + " question" + (unanswered.size() == 1 ? " is" : "s are")
                    + " still pending — please answer " + summarise(unanswered));
        }

        // How many, per slot. Worded from the rule the author picked, not the
        // derived numbers, because that is what the respondent was shown.
        for (Map.Entry<AnswerSlot, Set<Option>> e : chosen.entrySet()) {
            Question question = questionsById.get(e.getKey().questionId());
            int picked = e.getValue().size();
            if (!SelectionBounds.of(question).allows(picked)) {
                throw badRequest(labels.get(e.getKey().questionId())
                        + " " + expectation(question) + " — " + picked + " selected");
            }
        }

        // Pass 2 — replace-all write of the pair's single answer set. Flush
        // the deletes before inserting, or Hibernate orders the inserts
        // first and trips the unique tuple on a re-attempt.
        Long respondentUserId = mapping.getRespondent().getId();
        Long assessmentId = mapping.getAssessment().getAssessmentId();
        assessmentAnswers.deleteByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessmentId);
        assessmentAnswers.flush();
        for (Map.Entry<AnswerSlot, Set<Option>> e : chosen.entrySet()) {
            Question question = questionsById.get(e.getKey().questionId());
            QuestionRow row = e.getKey().questionRowId() == null ? null
                    : question.getRows().stream()
                            .filter(r -> r.getQuestionRowId().equals(e.getKey().questionRowId()))
                            .findFirst().orElseThrow();
            for (Option option : e.getValue()) {
                AssessmentAnswer answer = new AssessmentAnswer();
                answer.setRespondent(mapping.getRespondent());
                answer.setAssessment(mapping.getAssessment());
                answer.setQuestion(question);
                answer.setQuestionRow(row);
                answer.setOption(option);
                assessmentAnswers.save(answer);
            }
        }
        // One row per written answer, with no option — the shape
        // AssessmentAnswer has reserved for free text since it was written,
        // and the one the export already reads (option ?: answerText).
        for (Map.Entry<Long, String> e : typed.entrySet()) {
            AssessmentAnswer answer = new AssessmentAnswer();
            answer.setRespondent(mapping.getRespondent());
            answer.setAssessment(mapping.getAssessment());
            answer.setQuestion(questionsById.get(e.getKey()));
            answer.setAnswerText(e.getValue());
            assessmentAnswers.save(answer);
        }
        // Force the answer inserts now, so isPersisted is only ever set after
        // the rows have actually reached MySQL — a failure here rolls the
        // whole submit back rather than reporting a durable write that never
        // happened.
        assessmentAnswers.flush();

        mapping.setAssessmentStatus(RespondentAssessmentStatus.COMPLETED);
        mapping.setPersisted(true);
        // Attempt-level focus-popup tally. Null (older clients) or negative
        // clamps to 0 rather than rejecting the whole submission.
        Integer popUpCount = request == null ? null : request.popUpCount();
        mapping.setPopUpCount(popUpCount == null ? 0 : Math.max(0, popUpCount));
        return PortalAttemptStatusResponse.from(mappings.save(mapping));
    }

    /**
     * The attempt gate: the bearer token's respondent must own the attempt,
     * and the attempt's assessment must be ACTIVE. Returns the mapping with
     * respondent, assessment, and questionnaire fetched.
     */
    private RespondentAssessmentMapping requireOwnAttempt(String authorizationHeader, Long mappingId) {
        RespondentUser respondent = auth.requireRespondent(authorizationHeader);
        RespondentAssessmentMapping mapping = mappings.findForPortalDelivery(mappingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Assessment attempt " + mappingId + " not found"));
        if (!mapping.getRespondent().getId().equals(respondent.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This assessment is not assigned to you");
        }
        if (mapping.getAssessment().getStatus() != AssessmentStatus.ACTIVE) {
            throw conflict("This assessment is not currently active");
        }
        return mapping;
    }

    /**
     * One answerable slot: a whole question, or one row of a grid. Grids are
     * the only type where a question holds more than one, and being a record
     * makes it a map key with no further ceremony.
     */
    private record AnswerSlot(Long questionId, Long questionRowId) {
    }

    /**
     * What MySQL's TEXT column holds, in bytes. The submit validator refuses
     * anything longer instead of letting MySQL truncate it — there is no
     * per-question length limit by design, only this storage fact.
     */
    private static final int MAX_ANSWER_TEXT_BYTES = 65_535;

    /** Every slot a question must fill: one per grid row, otherwise just one. */
    private static List<AnswerSlot> slotsOf(Question question) {
        if (question.getQuestionType() != QuestionType.LIKERT_GRID) {
            return List.of(new AnswerSlot(question.getQuestionId(), null));
        }
        return question.getRows().stream()
                .map(r -> new AnswerSlot(question.getQuestionId(), r.getQuestionRowId()))
                .toList();
    }

    /** How many pending questions a message names before it says "and n more". */
    private static final int LABELS_SHOWN = 5;

    /**
     * questionId → the name the respondent's question index shows: "Section B
     * · Q4", numbered from 1 WITHIN its section, which is how the authoring
     * wizard and the portal's navigator both number them — a global running
     * number would say "Q27" where the respondent is looking at "Q7". A flat
     * questionnaire, or a section with no name, gets the bare "Q4".
     *
     * Placements arrive in delivery order (every question of section 1, then
     * every question of section 2 — see DISPLAY_ORDER on the repository), so
     * one counter per section is the whole algorithm. question-runner.tsx
     * builds the identical string client-side; the two must not diverge.
     */
    private static Map<Long, String> navigatorLabels(List<QuestionnaireQuestion> placements) {
        Map<Long, Integer> counters = new LinkedHashMap<>();
        Map<Long, String> labels = new LinkedHashMap<>();
        for (QuestionnaireQuestion placement : placements) {
            Section section = placement.getSection();
            // 0 is not a real sectionId, so it can stand for "no section"
            // without a nullable map key.
            int number = counters.merge(section == null ? 0L : section.getSectionId(), 1, Integer::sum);
            String name = section == null || section.getName() == null ? "" : section.getName().trim();
            labels.put(placement.getQuestion().getQuestionId(),
                    name.isEmpty() ? "Q" + number : name + " · Q" + number);
        }
        return labels;
    }

    /**
     * "Section B · Q4, Section B · Q7 and 3 more" — a respondent who left
     * twenty questions blank needs the first few and a count, not a wall of
     * labels. The portal caps its own list the same way.
     */
    private static String summarise(Collection<String> labels) {
        List<String> shown = labels.stream().limit(LABELS_SHOWN).toList();
        int rest = labels.size() - shown.size();
        return String.join(", ", shown) + (rest == 0 ? "" : " and " + rest + " more");
    }

    /** "needs exactly 3 selections" — the rule as the respondent was told it. */
    private static String expectation(Question question) {
        SelectionRule rule = question.getSelectionRule();
        Integer count = question.getSelectionCount();
        if (rule == null || count == null) {
            return "takes one answer";
        }
        return switch (rule) {
            case EQUALS -> "needs exactly " + count + " selection" + (count == 1 ? "" : "s");
            case MAX -> "accepts at most " + count + " selection" + (count == 1 ? "" : "s");
            case MIN -> "needs at least " + count + " selection" + (count == 1 ? "" : "s");
        };
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
