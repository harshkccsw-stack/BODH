package com.bodhpsychometric.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

        // Pass 2 — replace-all write. Flush the deletes before inserting, or
        // Hibernate orders the inserts first and trips the unique pair.
        demographicResponses.deleteByMapping_RespondentAssessmentMappingId(mappingId);
        demographicResponses.flush();
        for (Map.Entry<Long, String> e : values.entrySet()) {
            DemographicResponse row = new DemographicResponse();
            row.setMapping(mapping);
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
     * The once-and-for-all submission: one answer per placed question, every
     * option verified to belong to its question, all-or-nothing, then
     * ONGOING → COMPLETED. Answers only ever exist for COMPLETED attempts.
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
        if (assessmentAnswers.existsByMapping_RespondentAssessmentMappingId(mappingId)) {
            throw conflict("This attempt already has recorded answers");
        }

        Long questionnaireId = mapping.getAssessment().getQuestionnaire().getQuestionnaireId();
        Map<Long, Question> questionsById = placements.findForPortalDelivery(questionnaireId).stream()
                .distinct()
                .collect(Collectors.toMap(p -> p.getQuestion().getQuestionId(),
                        p -> p.getQuestion(), (a, b) -> a, LinkedHashMap::new));
        if (questionsById.isEmpty()) {
            throw conflict("This assessment has no questions yet");
        }

        List<PortalSubmitRequest.AnswerEntry> entries =
                request == null || request.answers() == null ? List.of() : request.answers();

        // Pass 1 — validate every answer before writing anything. The option
        // must belong to the question on the same row (the rule the schema
        // cannot express).
        Map<Long, Option> chosen = new LinkedHashMap<>();
        for (PortalSubmitRequest.AnswerEntry entry : entries) {
            if (entry.questionId() == null || entry.optionId() == null) {
                throw badRequest("Each answer needs a questionId and an optionId");
            }
            Question question = questionsById.get(entry.questionId());
            if (question == null) {
                throw badRequest("Question " + entry.questionId() + " is not part of this assessment");
            }
            if (chosen.containsKey(entry.questionId())) {
                throw badRequest("Duplicate answer for question " + entry.questionId());
            }
            Option option = question.getOptions().stream()
                    .filter(o -> o.getOptionId().equals(entry.optionId()))
                    .findFirst().orElse(null);
            if (option == null) {
                throw badRequest("Option " + entry.optionId() + " does not belong to question "
                        + entry.questionId());
            }
            chosen.put(entry.questionId(), option);
        }

        List<Long> unanswered = questionsById.keySet().stream()
                .filter(id -> !chosen.containsKey(id))
                .toList();
        if (!unanswered.isEmpty()) {
            throw badRequest("All questions must be answered — missing questionIds: " + unanswered);
        }

        // Pass 2 — write every answer row, then close the attempt.
        for (Map.Entry<Long, Option> e : chosen.entrySet()) {
            AssessmentAnswer answer = new AssessmentAnswer();
            answer.setMapping(mapping);
            answer.setQuestion(questionsById.get(e.getKey()));
            answer.setOption(e.getValue());
            assessmentAnswers.save(answer);
        }
        mapping.setAssessmentStatus(RespondentAssessmentStatus.COMPLETED);
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

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
