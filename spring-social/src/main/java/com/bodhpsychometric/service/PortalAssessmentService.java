package com.bodhpsychometric.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
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
import com.bodhpsychometric.dto.PortalAssessmentDetailResponse.PortalOption;
import com.bodhpsychometric.dto.PortalAttemptStatusResponse;
import com.bodhpsychometric.dto.PortalBeginRequest;
import com.bodhpsychometric.dto.PortalPartialAnswers;
import com.bodhpsychometric.dto.PortalProgressRequest;
import com.bodhpsychometric.dto.PortalProgressResponse;
import com.bodhpsychometric.dto.PortalQuestionnaireContent;
import com.bodhpsychometric.dto.PortalQuestionnaireContent.ContentQuestion;
import com.bodhpsychometric.dto.PortalSubmitRequest;
import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;
import com.bodhpsychometric.dto.PortalSubmitRequest.GamePartEntry;
import com.bodhpsychometric.dto.PortalSubmitRequest.GameResultEntry;
import com.bodhpsychometric.dto.GameRef;
import com.bodhpsychometric.dto.StagedSubmission;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.demographics.DemographicField;
import com.bodhpsychometric.model.demographics.DemographicResponse;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;

/**
 * The respondent take flow, end to end: fetch the attempt's content, begin it
 * (demographic form + consent + NOT_STARTED → ONGOING), save partial answers
 * mid-attempt, submit it (all answers, ONGOING → COMPLETED). Every entry point
 * runs the attempt gate: the caller's token must belong to the respondent who
 * owns the attempt, and the assessment must be ACTIVE.
 *
 * <p>Redis sits in three places, all of them OPTIONAL (see PortalRedisStore):
 * the questionnaire content is served from the shared cache; partial answers
 * live only in Redis; and submit is Redis-FIRST — the validated answers are
 * staged as an envelope and 200 returned before MySQL is touched, with
 * SubmissionDigestService landing them afterwards. A staged-but-undigested
 * submission is the {@code submissionPending} state: the attempt reads
 * ONGOING/unpersisted in MySQL but is finished as far as the respondent is
 * concerned, so every entry point here refuses it like COMPLETED. With Redis
 * away, submit degrades to the original synchronous MySQL write and the rest
 * of the flow behaves exactly as before the integration.
 */
@Service
public class PortalAssessmentService {

    private final PortalAuthService auth;
    private final RespondentAssessmentMappingRepository mappings;
    private final QuestionnaireDemographicFieldRepository demographicMappings;
    private final DemographicResponseRepository demographicResponses;
    private final PortalContentService content;
    private final PortalRedisStore redis;
    private final AssessmentSubmissionWriter writer;

    public PortalAssessmentService(PortalAuthService auth,
            RespondentAssessmentMappingRepository mappings,
            QuestionnaireDemographicFieldRepository demographicMappings,
            DemographicResponseRepository demographicResponses,
            PortalContentService content,
            PortalRedisStore redis,
            AssessmentSubmissionWriter writer) {
        this.auth = auth;
        this.mappings = mappings;
        this.demographicMappings = demographicMappings;
        this.demographicResponses = demographicResponses;
        this.content = content;
        this.redis = redis;
        this.writer = writer;
    }

    /**
     * Everything the portal renders for one attempt. The heavy half comes
     * from the content cache; the attempt fields are read live; and an
     * ONGOING attempt gets its partial-answer snapshot (if any) embedded so
     * a resume backfills in the same call.
     */
    @Transactional(readOnly = true)
    public PortalAssessmentDetailResponse getDetail(String authorizationHeader, Long mappingId) {
        RespondentAssessmentMapping mapping = requireOwnAttempt(authorizationHeader, mappingId);
        refuseWhilePending(mappingId);
        PortalQuestionnaireContent questionnaire = content.contentOf(
                mapping.getAssessment().getQuestionnaire().getQuestionnaireId());
        List<AnswerEntry> savedAnswers = null;
        List<GameResultEntry> savedGameResults = null;
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.ONGOING) {
            // Read regardless of the savePartialAnswers toggle: a snapshot
            // written before the toggle was switched off is still the
            // respondent's work, and backfilling it costs nothing.
            PortalPartialAnswers partial = redis.readPartial(mappingId);
            savedAnswers = partial == null ? null : partial.answers();
            savedGameResults = partial == null ? null : partial.gameResults();
        }
        return PortalAssessmentDetailResponse.from(mapping, questionnaire, savedAnswers, savedGameResults);
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
        refuseWhilePending(mappingId);

        List<PortalBeginRequest.DemographicEntry> entries =
                request == null || request.demographics() == null ? List.of() : request.demographics();

        Long questionnaireId = mapping.getAssessment().getQuestionnaire().getQuestionnaireId();
        List<QuestionnaireDemographicField> mapped = demographicMappings.findForPortalDelivery(questionnaireId);
        Map<Long, QuestionnaireDemographicField> byFieldId = mapped.stream().collect(Collectors.toMap(
                qdf -> qdf.getDemographicField().getDemographicFieldId(), qdf -> qdf,
                (a, b) -> a, LinkedHashMap::new));

        // Pass 1 — validate every entry before writing anything.
        Map<Long, FieldAnswer> values = new LinkedHashMap<>();
        for (PortalBeginRequest.DemographicEntry entry : entries) {
            if (entry.demographicFieldId() == null) {
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
            DemographicField field = qdf.getDemographicField();
            List<String> picked = field.getFieldType() == DemographicFieldType.CHECKLIST
                    ? checklistTicks(field, entry)
                    : List.of(singleValue(field, entry));
            values.put(entry.demographicFieldId(), new FieldAnswer(picked, otherText(field, entry, picked)));
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
        // trips the unique tuple when the form is re-entered. A checklist is
        // one row per tick, optionValue naming the tick; every other type is
        // one row with optionValue '' — which is what keeps the database's
        // one-answer-per-field guarantee for them (V39).
        demographicResponses.deleteByRespondent_IdAndAssessment_AssessmentId(
                mapping.getRespondent().getId(), mapping.getAssessment().getAssessmentId());
        demographicResponses.flush();
        for (Map.Entry<Long, FieldAnswer> e : values.entrySet()) {
            DemographicField field = byFieldId.get(e.getKey()).getDemographicField();
            boolean checklist = field.getFieldType() == DemographicFieldType.CHECKLIST;
            for (String value : e.getValue().values()) {
                DemographicResponse row = new DemographicResponse();
                row.setRespondent(mapping.getRespondent());
                row.setAssessment(mapping.getAssessment());
                row.setDemographicField(field);
                row.setResponseValue(value);
                row.setOptionValue(checklist ? value : "");
                row.setOtherText(value.equals(field.getOtherOptionLabel()) ? e.getValue().otherText() : null);
                demographicResponses.save(row);
            }
        }

        RespondentUser respondent = mapping.getRespondent();
        if (mapping.getAssessment().isShowTermsAndConditions() && !respondent.isConsented()) {
            respondent.setConsented(true);
            respondent.setConsentedAt(OffsetDateTime.now());
        }

        // The FIRST begin is the start: a re-launch of an ONGOING attempt
        // re-enters the demographics above but keeps the original time.
        if (mapping.getStartedAt() == null) {
            mapping.setStartedAt(OffsetDateTime.now());
        }
        mapping.setAssessmentStatus(RespondentAssessmentStatus.ONGOING);
        return PortalAttemptStatusResponse.from(mappings.save(mapping));
    }

    /**
     * Hands an in-flight attempt back to the respondent unstarted: ONGOING (or
     * NOT_STARTED already) → NOT_STARTED, so the portal offers "Launch
     * Assessment" again rather than "Resume".
     *
     * <p>What the attention timer calls when a countdown runs out — the
     * respondent left a focus popup unanswered for ten minutes, so the attempt
     * is stopped and they must take it from the top. The one thing there now IS
     * to clean is the Redis partial-answer snapshot: dropping it here is what
     * makes the restart genuinely fresh instead of backfilling the abandoned
     * attempt's answers. MySQL still has nothing to delete — answers are only
     * written at submit, and the demographic set is replace-all on the next
     * begin.
     *
     * <p>COMPLETED is the one state this cannot touch — a submitted attempt is
     * frozen (a Redis-staged one included), and only a practitioner's reset
     * reopens it. Idempotent on an attempt that is already NOT_STARTED.
     */
    @Transactional
    public PortalAttemptStatusResponse abandon(String authorizationHeader, Long mappingId) {
        RespondentAssessmentMapping mapping = requireOwnAttempt(authorizationHeader, mappingId);
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED) {
            throw conflict("This assessment has already been submitted");
        }
        refuseWhilePending(mappingId);
        mapping.setAssessmentStatus(RespondentAssessmentStatus.NOT_STARTED);
        mapping.setPersisted(false);
        // The attempt is over; the next begin starts a new one.
        mapping.setStartedAt(null);
        redis.deletePartial(mappingId);
        redis.deleteHeartbeat(mappingId);
        return PortalAttemptStatusResponse.from(mappings.save(mapping));
    }

    /**
     * The partial-answer save: the portal sends the FULL set of answers
     * marked so far (section change, or every few questions on a sectionless
     * paper), and the whole snapshot replaces the previous one in Redis.
     * Deliberately unvalidated beyond structure — it is partial by nature,
     * and submit re-validates everything — and deliberately not a MySQL
     * fallback: with Redis away the save is skipped ({@code saved=false}),
     * because partial snapshots are a convenience, not a record.
     */
    @Transactional(readOnly = true)
    public PortalProgressResponse saveProgress(String authorizationHeader, Long mappingId,
            PortalProgressRequest request) {
        RespondentAssessmentMapping mapping = requireOwnAttempt(authorizationHeader, mappingId);
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED) {
            throw conflict("This assessment has already been submitted");
        }
        refuseWhilePending(mappingId);
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.NOT_STARTED) {
            throw conflict("Begin the attempt before saving progress");
        }
        if (!mapping.getAssessment().isSavePartialAnswers()) {
            throw conflict("Partial-answer saving is not enabled for this assessment");
        }
        List<AnswerEntry> entries =
                request == null || request.answers() == null ? List.of() : request.answers();
        for (AnswerEntry entry : entries) {
            if (entry.questionId() == null) {
                throw badRequest("Each answer needs a questionId");
            }
        }
        // Kept as sent — partial by nature, like the answers; submit is where
        // a game's numbers are validated and resolved.
        List<GameResultEntry> games =
                request == null || request.gameResults() == null ? List.of() : request.gameResults();
        boolean saved = redis.writePartial(mappingId,
                new PortalPartialAnswers(mappingId, entries, System.currentTimeMillis(), games));
        return new PortalProgressResponse(saved, entries.size());
    }

    /**
     * The submission: an answer for every required question (an optional one
     * may be absent), every option verified
     * to belong to its question, then handed off Redis-FIRST — the validated
     * set is staged as a 7-day envelope, the partial snapshot is dropped, and
     * the respondent gets their 200 with {@code submissionPending=true} while
     * SubmissionDigestService lands the rows in MySQL behind them. Only when
     * Redis refuses the envelope does this fall back to the original
     * synchronous all-or-nothing MySQL write.
     *
     * <p>Validation is NOT deferred with the write: the respondent must get
     * their 400s (pending questions, bounds) while they can still fix them,
     * and it needs no MySQL of its own — the rules run against the same
     * cached content the portal rendered from. The answer set belongs to the
     * (respondent, assessment) pair, not the attempt — a granted re-attempt
     * REPLACES the pair's previous set. Within one attempt the COMPLETED and
     * pending gates make submission once-and-for-all.
     *
     * <p>Deliberately not @Transactional: the Redis path writes no MySQL at
     * all, and the fallback's atomicity lives in the writer's own
     * transaction.
     */
    public PortalAttemptStatusResponse submit(String authorizationHeader, Long mappingId,
            PortalSubmitRequest request) {
        RespondentAssessmentMapping mapping = requireOwnAttempt(authorizationHeader, mappingId);
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED) {
            throw conflict("This assessment has already been submitted");
        }
        refuseWhilePending(mappingId);
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.NOT_STARTED) {
            throw conflict("Begin the attempt before submitting answers");
        }

        PortalQuestionnaireContent questionnaire = content.contentOf(
                mapping.getAssessment().getQuestionnaire().getQuestionnaireId());
        List<AnswerEntry> entries =
                request == null || request.answers() == null ? List.of() : request.answers();
        List<AnswerEntry> normalized = validate(questionnaire, entries);
        List<GameResultEntry> games = validateGameResults(questionnaire, normalized,
                request == null || request.gameResults() == null ? List.of() : request.gameResults());

        Integer popUpCount = request == null ? null : request.popUpCount();
        int popUps = popUpCount == null ? 0 : Math.max(0, popUpCount);

        StagedSubmission staged = StagedSubmission.of(mappingId,
                mapping.getRespondent().getId(),
                mapping.getAssessment().getAssessmentId(),
                normalized, popUps, games);
        if (redis.stageSubmission(staged)) {
            redis.deletePartial(mappingId);
            redis.deleteHeartbeat(mappingId);
            // ONGOING + isPersisted=false is the truth in MySQL right now;
            // submissionPending is what tells the portal the submission is in.
            return PortalAttemptStatusResponse.from(mapping, true);
        }

        // Redis would not hold the envelope — the original synchronous path.
        RespondentAssessmentMapping saved = writer.persist(mappingId, normalized, popUps, games,
                OffsetDateTime.now());
        redis.deletePartial(mappingId);
        redis.deleteHeartbeat(mappingId);
        return PortalAttemptStatusResponse.from(saved);
    }

    /**
     * Pass 1 of the old transactional submit, now runnable against the cached
     * content: every rule the schema cannot express, checked before anything
     * is staged or written. Returns the normalized entries the writer/digest
     * stores verbatim — one per (question, row, option) selection, deduped,
     * plus one per trimmed free-text answer.
     */
    private List<AnswerEntry> validate(PortalQuestionnaireContent questionnaire,
            List<AnswerEntry> entries) {
        Map<Long, ContentQuestion> questionsById = questionnaire.questions().stream()
                .collect(Collectors.toMap(ContentQuestion::questionId, q -> q,
                        (a, b) -> a, LinkedHashMap::new));
        // What to CALL a question when a message has to point the respondent
        // back at one. Never its id — that names nothing they can see.
        Map<Long, String> labels = navigatorLabels(questionnaire);
        if (questionsById.isEmpty()) {
            throw conflict("This assessment has no questions yet");
        }

        // One entry per SELECTED OPTION, so a multi-select question appears
        // several times — the payload is isomorphic to the AssessmentAnswer
        // rows it becomes. The set dedupes a repeated (question, row, option)
        // triple silently, and that is load-bearing rather than tidy: two
        // identical rows would violate uqAaRespondentAssessmentQuestionRowOption
        // at digest time, long after the respondent could be told.
        //
        // Answers are collected per SLOT, not per question: a grid is one
        // question with one slot per row, everything else is one question
        // with a single null-row slot. Every rule below then reads the same
        // for both, and the selection bounds apply per row for free.
        //
        // Free text is the exception the option map cannot hold, so it gets
        // its own: SHORT_ANSWER has no options at all, and one entry IS the
        // whole answer.
        Map<AnswerSlot, Set<Long>> chosen = new LinkedHashMap<>();
        Map<Long, String> typed = new LinkedHashMap<>();
        // What was typed into an "Other…" (FREE_TEXT) option, keyed by the
        // (slot, option) it rides on — it is stored on the SAME answer row as
        // the optionId, so it travels beside the selection, never instead of
        // it. A selected FREE_TEXT option with nothing typed is refused, and
        // text on any other option still is.
        Map<AnswerSlot, Map<Long, String>> otherText = new LinkedHashMap<>();
        for (AnswerEntry entry : entries) {
            if (entry.questionId() == null) {
                throw badRequest("Each answer needs a questionId");
            }
            ContentQuestion question = questionsById.get(entry.questionId());
            if (question == null) {
                throw badRequest("Question " + entry.questionId() + " is not part of this assessment");
            }
            if (question.questionType() == QuestionType.SHORT_ANSWER) {
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
            if (entry.optionId() == null) {
                throw badRequest("Each answer needs a questionId and an optionId");
            }
            PortalOption option = question.options().stream()
                    .filter(o -> o.optionId().equals(entry.optionId()))
                    .findFirst().orElse(null);
            if (option == null) {
                throw badRequest("Option " + entry.optionId() + " does not belong to question "
                        + entry.questionId());
            }
            boolean freeText = option.contentType() == ContentType.FREE_TEXT;
            String typedHere = entry.answerText() == null || entry.answerText().isBlank()
                    ? null : entry.answerText().trim();
            if (!freeText && entry.answerText() != null) {
                throw badRequest("Question " + entry.questionId()
                        + " is answered by picking an option, not by typing");
            }
            if (freeText) {
                // Picking "Other" and writing nothing is not an answer — the
                // label is what they picked, the text is what they meant.
                if (typedHere == null) {
                    throw badRequest(labels.get(entry.questionId()) + " needs the \""
                            + option.optionText() + "\" answer written in");
                }
                // Same byte cap as a short answer, same reasoning: refused,
                // never silently truncated.
                if (typedHere.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_ANSWER_TEXT_BYTES) {
                    throw badRequest("The \"" + option.optionText() + "\" answer to "
                            + labels.get(entry.questionId()) + " is too long");
                }
            }
            boolean isGrid = question.questionType() == QuestionType.LIKERT_GRID;
            if (isGrid && entry.questionRowId() == null) {
                throw badRequest("Question " + entry.questionId()
                        + " is a grid — every answer needs the questionRowId it belongs to");
            }
            if (!isGrid && entry.questionRowId() != null) {
                throw badRequest("Question " + entry.questionId()
                        + " has no rows — questionRowId must be omitted");
            }
            if (isGrid && question.rows().stream()
                    .noneMatch(r -> r.questionRowId().equals(entry.questionRowId()))) {
                throw badRequest("Row " + entry.questionRowId() + " does not belong to question "
                        + entry.questionId());
            }
            AnswerSlot slot = new AnswerSlot(entry.questionId(), entry.questionRowId());
            chosen.computeIfAbsent(slot, k -> new LinkedHashSet<>()).add(entry.optionId());
            if (freeText) {
                // A repeated (slot, option) pair is deduped like the selection
                // itself — the first text wins, as the first tick did.
                otherText.computeIfAbsent(slot, k -> new LinkedHashMap<>())
                        .putIfAbsent(entry.optionId(), typedHere);
            }
        }

        // Every REQUIRED question still has to be answered — and every ROW of
        // every grid, which is what makes a half-filled grid a 400 rather
        // than a quietly incomplete answer set. A slot with no selections
        // never entered the map, so the floor of 1 that every rule shares
        // needs no separate check.
        //
        // An OPTIONAL question may be left untouched. Touched, it is held to
        // the same rule as a required one: a grid is every row or none, and
        // the bounds loop below checks whatever was picked. Blank or valid,
        // never half-answered.
        //
        // Named the way the respondent's question index names them, and a SET
        // so a grid missing three rows is reported once, as the one question
        // they have to go back to.
        Set<String> unanswered = new LinkedHashSet<>();
        for (ContentQuestion question : questionsById.values()) {
            // A short answer fills no slot — its answer is text, and it is
            // present or it is not.
            if (question.questionType() == QuestionType.SHORT_ANSWER) {
                if (!question.optional() && !typed.containsKey(question.questionId())) {
                    unanswered.add(labels.get(question.questionId()));
                }
                continue;
            }
            if (question.optional() && slotsOf(question).stream().noneMatch(chosen::containsKey)) {
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
        for (Map.Entry<AnswerSlot, Set<Long>> e : chosen.entrySet()) {
            ContentQuestion question = questionsById.get(e.getKey().questionId());
            int picked = e.getValue().size();
            if (picked < question.minSelections() || picked > question.maxSelections()) {
                throw badRequest(labels.get(e.getKey().questionId())
                        + " " + expectation(question) + " — " + picked + " selected");
            }
        }

        List<AnswerEntry> normalized = new ArrayList<>();
        for (Map.Entry<AnswerSlot, Set<Long>> e : chosen.entrySet()) {
            Map<Long, String> textsHere = otherText.getOrDefault(e.getKey(), Map.of());
            for (Long optionId : e.getValue()) {
                normalized.add(new AnswerEntry(e.getKey().questionId(), optionId,
                        e.getKey().questionRowId(), textsHere.get(optionId)));
            }
        }
        for (Map.Entry<Long, String> e : typed.entrySet()) {
            normalized.add(new AnswerEntry(e.getKey(), null, null, e.getValue()));
        }
        return normalized;
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
     * A Redis-staged submission is a finished attempt whatever MySQL says, so
     * every take-flow entry point refuses to touch one — begin cannot re-open
     * it, abandon cannot un-submit it, submit cannot double it. The digest
     * clearing the envelope is what ends this state (COMPLETED then takes
     * over); a practitioner reset clears it the discarding way.
     */
    /** What one demographic field was answered with: its value(s), and any write-in text. */
    private record FieldAnswer(List<String> values, String otherText) {
    }

    /** The cap on a write-in, matching demographic_response.other_text (V39). */
    private static final int OTHER_TEXT_MAX = 255;

    /**
     * A Text / Number / Date / Dropdown answer: exactly one non-blank value,
     * checked against the field's type. A list of values is a checklist's
     * shape and is refused here rather than quietly ignored.
     */
    private String singleValue(DemographicField field, PortalBeginRequest.DemographicEntry entry) {
        if (entry.values() != null && !entry.values().isEmpty()) {
            throw badRequest("\"" + field.getLabel() + "\" takes one value, not a list");
        }
        if (entry.value() == null || entry.value().isBlank()) {
            throw badRequest("Each demographic entry needs a demographicFieldId and a non-blank value");
        }
        String value = entry.value().trim();
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
                if (!field.choices().contains(value)) {
                    throw badRequest("\"" + value + "\" is not one of \"" + field.getLabel() + "\"'s choices");
                }
            }
            default -> { /* TEXT — anything non-blank */ }
        }
        return value;
    }

    /**
     * A checklist's ticks: at least one, every one an exact choice of the
     * field, repeats collapsed, returned in the field's own choice order (the
     * write-in last) so the same ticks always store the same way. Repeats are
     * collapsed rather than refused — but they MUST be collapsed, or the
     * second row breaches the unique key and the attempt 500s at commit.
     * An optional checklist left blank is sent as no entry at all.
     */
    private List<String> checklistTicks(DemographicField field, PortalBeginRequest.DemographicEntry entry) {
        if (entry.value() != null && !entry.value().isBlank()) {
            throw badRequest("\"" + field.getLabel() + "\" is a checklist — send the ticked options as values");
        }
        Set<String> ticked = new LinkedHashSet<>();
        for (String tick : entry.values() == null ? List.<String>of() : entry.values()) {
            if (tick == null || tick.isBlank()) {
                continue;
            }
            String value = tick.trim();
            if (!field.choices().contains(value)) {
                throw badRequest("\"" + value + "\" is not one of \"" + field.getLabel() + "\"'s choices");
            }
            ticked.add(value);
        }
        if (ticked.isEmpty()) {
            throw badRequest("Tick at least one option for \"" + field.getLabel() + "\"");
        }
        return field.choices().stream().filter(ticked::contains).toList();
    }

    /**
     * The write-in text: required (trimmed, at most 255 characters) when the
     * field's "Other" choice was picked or ticked, refused when it was not —
     * text with no choice behind it would sit on a row that does not say
     * "Other". Blank text counts as none.
     */
    private String otherText(DemographicField field, PortalBeginRequest.DemographicEntry entry, List<String> picked) {
        String text = entry.otherText() == null || entry.otherText().isBlank() ? null : entry.otherText().trim();
        String otherLabel = field.getOtherOptionLabel();
        boolean pickedOther = field.getFieldType().hasChoices() && otherLabel != null && picked.contains(otherLabel);
        if (!pickedOther) {
            if (text != null) {
                throw badRequest("\"" + field.getLabel() + "\" only takes typed text when its Other choice is picked");
            }
            return null;
        }
        if (text == null) {
            throw badRequest("Please specify your answer for \"" + field.getLabel() + "\"");
        }
        if (text.codePointCount(0, text.length()) > OTHER_TEXT_MAX) {
            throw badRequest("Your answer for \"" + field.getLabel() + "\" must be at most "
                    + OTHER_TEXT_MAX + " characters");
        }
        return text;
    }

    private void refuseWhilePending(Long mappingId) {
        if (redis.hasPendingSubmission(mappingId)) {
            throw conflict("This assessment has been submitted and is being processed");
        }
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

    // Bounds on a game's numbers. They catch a broken or tampered client, not
    // a fast player: a day of play, a million responses, a billion pixels.
    private static final long MAX_GAME_MS = 24L * 60 * 60 * 1000;
    private static final long MAX_GAME_COUNT = 1_000_000L;
    private static final long MAX_GAME_MOUSE_PX = 1_000_000_000L;
    private static final int MAX_GAME_PARTS = 20;
    private static final int MAX_GROUP_NAME = 30;
    /** A part code is named by the game file; the column is varchar(40). */
    private static final java.util.regex.Pattern GAME_PART_CODE = java.util.regex.Pattern.compile("^[A-Z0-9_]{1,40}$");

    /**
     * The finished games' numbers, checked against the delivered content and
     * against the ANSWERS just validated — the answer row is the proof a game
     * was finished (the portal ticks the game's option only on completion),
     * so a result for a question not answered with its game option is
     * refused. The reverse is accepted: an answered game with no result is a
     * valid submission (the answer alone records completion).
     *
     * <p>Part codes are not checked against the game: a game's parts are
     * defined by its file in the portal, and a third copy of that list here
     * would drift. Only their shape and the numbers' bounds are checked.
     *
     * <p>Returns the entries with {@code gameId}/{@code gameVersion} taken
     * from the CONTENT (whatever the client sent there is ignored), part codes
     * upper-cased and the group name trimmed — the shape the writer stores.
     */
    private List<GameResultEntry> validateGameResults(PortalQuestionnaireContent questionnaire,
            List<AnswerEntry> answers, List<GameResultEntry> results) {
        if (results.isEmpty()) {
            return List.of();
        }
        Map<Long, ContentQuestion> questionsById = questionnaire.questions().stream()
                .collect(Collectors.toMap(ContentQuestion::questionId, q -> q, (a, b) -> a));
        Map<Long, String> labels = navigatorLabels(questionnaire);
        Set<String> answered = answers.stream()
                .filter(a -> a.optionId() != null)
                .map(a -> a.questionId() + ":" + a.optionId())
                .collect(Collectors.toSet());

        Set<Long> seen = new LinkedHashSet<>();
        List<GameResultEntry> out = new ArrayList<>();
        for (GameResultEntry result : results) {
            if (result == null || result.questionId() == null) {
                throw badRequest("Each game result needs a questionId");
            }
            ContentQuestion question = questionsById.get(result.questionId());
            if (question == null) {
                throw badRequest("Question " + result.questionId() + " is not part of this assessment");
            }
            String label = labels.get(question.questionId());
            GameRef game = question.questionType() == QuestionType.GAMES && !question.options().isEmpty()
                    ? question.options().get(0).game() : null;
            if (game == null) {
                throw badRequest(label + " is not a game question — it has no game results");
            }
            if (!answered.contains(question.questionId() + ":" + question.options().get(0).optionId())) {
                throw badRequest("The game in " + label + " was not finished — its results cannot be recorded");
            }
            if (!seen.add(question.questionId())) {
                throw badRequest(label + " has two sets of game results");
            }
            List<GamePartEntry> parts = result.parts() == null ? List.of() : result.parts();
            if (parts.isEmpty()) {
                throw badRequest("The game results for " + label + " have no parts");
            }
            if (parts.size() > MAX_GAME_PARTS) {
                throw badRequest("The game results for " + label + " have more than " + MAX_GAME_PARTS + " parts");
            }
            Set<String> codes = new LinkedHashSet<>();
            List<GamePartEntry> clean = new ArrayList<>(parts.size());
            for (GamePartEntry part : parts) {
                clean.add(validGamePart(part, label, codes));
            }
            out.add(new GameResultEntry(question.questionId(), game.gameId(), game.version(), clean));
        }
        return out;
    }

    /** One part's numbers: the six core metrics required, every number in bounds. */
    private static GamePartEntry validGamePart(GamePartEntry part, String label, Set<String> codes) {
        if (part == null) {
            throw badRequest("The game results for " + label + " contain an empty part");
        }
        String code = part.partCode() == null ? "" : part.partCode().trim().toUpperCase(java.util.Locale.ROOT);
        if (!GAME_PART_CODE.matcher(code).matches()) {
            throw badRequest("A game part in " + label
                    + " needs a partCode of letters, digits and underscores (at most 40)");
        }
        if (!codes.add(code)) {
            throw badRequest(label + " reports the game part " + code + " twice");
        }
        String where = label + " · " + code;
        gameNumber(part.hits(), true, MAX_GAME_COUNT, "hits", where);
        gameNumber(part.falseAlarms(), true, MAX_GAME_COUNT, "falseAlarms", where);
        gameNumber(part.omissions(), true, MAX_GAME_COUNT, "omissions", where);
        gameNumber(part.durationMs(), true, MAX_GAME_MS, "durationMs", where);
        gameNumber(part.mouseDistancePx(), true, MAX_GAME_MOUSE_PX, "mouseDistancePx", where);
        gameNumber(part.mouseIdleSeconds(), true, MAX_GAME_MS / 1000, "mouseIdleSeconds", where);
        gameNumber(part.instructionTimeMs(), false, MAX_GAME_MS, "instructionTimeMs", where);
        gameNumber(part.groupNumber(), false, MAX_GAME_COUNT, "groupNumber", where);
        gameNumber(part.pauseCount(), false, MAX_GAME_COUNT, "pauseCount", where);
        gameNumber(part.pauseDurationMs(), false, MAX_GAME_MS, "pauseDurationMs", where);
        String groupName = part.groupName() == null || part.groupName().isBlank() ? null : part.groupName().trim();
        if (groupName != null && groupName.length() > MAX_GROUP_NAME) {
            throw badRequest(where + ": groupName is at most " + MAX_GROUP_NAME + " characters");
        }
        if (part.startedAt() != null && part.endedAt() != null && part.endedAt().isBefore(part.startedAt())) {
            throw badRequest(where + ": endedAt is before startedAt");
        }
        return new GamePartEntry(code, part.hits(), part.falseAlarms(), part.omissions(), part.durationMs(),
                part.mouseDistancePx(), part.mouseIdleSeconds(), part.instructionTimeMs(), part.groupNumber(),
                groupName, part.pauseCount(), part.pauseDurationMs(), part.startedAt(), part.endedAt());
    }

    private static void gameNumber(Number value, boolean required, long max, String field, String where) {
        if (value == null) {
            if (required) {
                throw badRequest(where + ": " + field + " is required");
            }
            return;
        }
        if (value.longValue() < 0 || value.longValue() > max) {
            throw badRequest(where + ": " + field + " must be between 0 and " + max);
        }
    }

    /** Every slot a question must fill: one per grid row, otherwise just one. */
    private static List<AnswerSlot> slotsOf(ContentQuestion question) {
        if (question.questionType() != QuestionType.LIKERT_GRID) {
            return List.of(new AnswerSlot(question.questionId(), null));
        }
        return question.rows().stream()
                .map(r -> new AnswerSlot(question.questionId(), r.questionRowId()))
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
     * Content questions arrive in delivery order (every question of section 1,
     * then every question of section 2 — the order the cache stores), so one
     * counter per section is the whole algorithm. question-runner.tsx builds
     * the identical string client-side; the two must not diverge.
     */
    private static Map<Long, String> navigatorLabels(PortalQuestionnaireContent questionnaire) {
        Map<Long, String> sectionNames = questionnaire.sections().stream()
                .collect(Collectors.toMap(
                        PortalAssessmentDetailResponse.PortalSection::sectionId,
                        s -> s.name() == null ? "" : s.name().trim(),
                        (a, b) -> a, LinkedHashMap::new));
        Map<Long, Integer> counters = new LinkedHashMap<>();
        Map<Long, String> labels = new LinkedHashMap<>();
        for (ContentQuestion question : questionnaire.questions()) {
            // 0 is not a real sectionId, so it can stand for "no section"
            // without a nullable map key.
            Long sectionKey = question.sectionId() == null ? 0L : question.sectionId();
            int number = counters.merge(sectionKey, 1, Integer::sum);
            String name = sectionNames.getOrDefault(question.sectionId(), "");
            labels.put(question.questionId(),
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
    private static String expectation(ContentQuestion question) {
        SelectionRule rule = question.selectionRule();
        Integer count = question.selectionCount();
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
