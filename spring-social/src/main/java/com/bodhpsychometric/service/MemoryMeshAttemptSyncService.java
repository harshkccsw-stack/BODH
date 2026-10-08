package com.bodhpsychometric.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.MemoryMeshAttemptSyncRequest;
import com.bodhpsychometric.dto.MemoryMeshAttemptSyncResponse;
import com.bodhpsychometric.dto.MemoryMeshRespondentSyncResponse;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.question.OptionRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;

/**
 * Stores an attempt MemoryMesh mirrored here, the way {@link
 * AssessmentSubmissionWriter} stores one taken on our own portal: the pair's
 * single answer set is replaced in full, then the allotment is marked
 * COMPLETED and persisted — so the Reports pages show it like any other.
 *
 * <p>One allotment per (respondent, assessment) here, so a re-mirror (a later
 * attempt on MemoryMesh) replaces the answers rather than adding a second
 * row. Pass 1 resolves and validates every answer; pass 2 writes.
 */
@Service
public class MemoryMeshAttemptSyncService {

    private final MemoryMeshSyncService respondentSync;
    private final RespondentUserRepository respondents;
    private final AssessmentRepository assessments;
    private final RespondentAssessmentMappingRepository mappings;
    private final AssessmentAnswerRepository answers;
    private final QuestionRepository questions;
    private final OptionRepository options;

    public MemoryMeshAttemptSyncService(MemoryMeshSyncService respondentSync, RespondentUserRepository respondents,
            AssessmentRepository assessments, RespondentAssessmentMappingRepository mappings,
            AssessmentAnswerRepository answers, QuestionRepository questions, OptionRepository options) {
        this.respondentSync = respondentSync;
        this.respondents = respondents;
        this.assessments = assessments;
        this.mappings = mappings;
        this.answers = answers;
        this.questions = questions;
        this.options = options;
    }

    private record Resolved(Question question, Option option, QuestionRow row, String text) {
    }

    @Transactional
    public MemoryMeshAttemptSyncResponse store(MemoryMeshAttemptSyncRequest request) {
        MemoryMeshRespondentSyncResponse who = respondentSync.sync(request.respondent());
        RespondentUser respondent = respondents.findById(who.respondentUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Respondent not found"));
        Assessment assessment = assessments.findById(request.assessmentId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Assessment not found"));

        // Pass 1.
        List<Resolved> resolved = new ArrayList<>();
        for (MemoryMeshAttemptSyncRequest.Answer a : request.answers() == null ? List.<MemoryMeshAttemptSyncRequest.Answer>of() : request.answers()) {
            if (a.questionId() == null) {
                throw bad("Every answer must name a question");
            }
            Question q = questions.findById(a.questionId())
                    .orElseThrow(() -> bad("Question " + a.questionId() + " does not exist here"));
            Option option = null;
            if (a.optionId() != null) {
                option = options.findById(a.optionId()).orElseThrow(() -> bad("Option " + a.optionId() + " does not exist here"));
                if (!option.getQuestion().getQuestionId().equals(q.getQuestionId())) {
                    throw bad("Option " + a.optionId() + " does not belong to question " + a.questionId());
                }
            } else if (a.optionPosition() != null) {
                List<Option> sorted = q.getOptions().stream().sorted(Comparator.comparingInt(Option::getSortOrder)).toList();
                if (a.optionPosition() < 0 || a.optionPosition() >= sorted.size()) {
                    throw bad("Question " + a.questionId() + " has no option at position " + a.optionPosition());
                }
                option = sorted.get(a.optionPosition());
            }
            QuestionRow row = null;
            if (a.questionRowId() != null || a.rowPosition() != null) {
                List<QuestionRow> sorted = q.getRows().stream().sorted(Comparator.comparingInt(QuestionRow::getSortOrder)).toList();
                if (a.questionRowId() != null) {
                    row = sorted.stream().filter(r -> r.getQuestionRowId().equals(a.questionRowId())).findFirst()
                            .orElseThrow(() -> bad("Row " + a.questionRowId() + " does not belong to question " + a.questionId()));
                } else {
                    if (a.rowPosition() < 0 || a.rowPosition() >= sorted.size()) {
                        throw bad("Question " + a.questionId() + " has no row at position " + a.rowPosition());
                    }
                    row = sorted.get(a.rowPosition());
                }
            }
            String text = a.answerText() == null || a.answerText().isBlank() ? null : a.answerText().trim();
            if (option == null && text == null) {
                throw bad("An answer to question " + a.questionId() + " chose nothing and typed nothing");
            }
            // A short answer is stored on its generated text-slot option
            // (V40), exactly as the portal's writer stores it. MemoryMesh
            // imported the question with no options, so it sends text only.
            // A WHOLE_NUMBER format (V48) is deliberately NOT enforced here:
            // the attempt is already finished in MemoryMesh, nobody is there
            // to correct it, and a 400 would drop the whole attempt over one
            // cell. MemoryMesh receives answerFormat with the import, to check
            // on its own screen.
            if (option == null && row == null) {
                option = q.textAnswerOption().orElse(null);
            }
            // Same two rules as the portal's submit validator: an "Other…"
            // (FREE_TEXT) option carries its typed text on the same row and
            // is nothing without it; any other option carries none.
            if (option != null) {
                boolean freeText = option.getContentType() == ContentType.FREE_TEXT;
                if (freeText && text == null) {
                    // A short answer's text slot has no label to quote.
                    throw bad((option.getOptionText() == null
                            ? "Question " + a.questionId()
                            : "The \"" + option.getOptionText() + "\" option of question " + a.questionId())
                            + " needs its typed answer");
                }
                if (!freeText && text != null) {
                    throw bad("Question " + a.questionId()
                            + " is answered by picking an option, not by typing");
                }
            }
            resolved.add(new Resolved(q, option, row, text));
        }

        // Pass 2 — replace-all for the pair, like our own writer.
        RespondentAssessmentMapping mapping = mappings
                .findByRespondent_IdAndAssessment_AssessmentId(respondent.getId(), assessment.getAssessmentId())
                .orElseGet(() -> {
                    RespondentAssessmentMapping m = new RespondentAssessmentMapping();
                    m.setRespondent(respondent);
                    m.setAssessment(assessment);
                    m.setAssessmentStatus(RespondentAssessmentStatus.NOT_STARTED);
                    return mappings.save(m);
                });
        answers.deleteByRespondent_IdAndAssessment_AssessmentId(respondent.getId(), assessment.getAssessmentId());
        answers.flush();
        for (Resolved r : resolved) {
            AssessmentAnswer row = new AssessmentAnswer();
            row.setRespondent(respondent);
            row.setAssessment(assessment);
            row.setQuestion(r.question());
            row.setOption(r.option());
            row.setQuestionRow(r.row());
            row.setAnswerText(r.text());
            answers.save(row);
        }
        answers.flush();
        mapping.setAssessmentStatus(RespondentAssessmentStatus.COMPLETED);
        mapping.setPersisted(true);
        // Taken in MemoryMesh: it sends when it was completed there but not
        // when it began, and a start from an earlier portal begin would belong
        // to an attempt these answers just replaced.
        mapping.setStartedAt(null);
        mapping.setCompletedAt(completedAt(request.completedAt()));
        mappings.save(mapping);
        return new MemoryMeshAttemptSyncResponse(respondent.getId(), mapping.getRespondentAssessmentMappingId(),
                resolved.size());
    }

    /**
     * MemoryMesh's ISO completion time when it is usable, else now. It needs
     * an offset or a Z — a bare local time names no instant — and a time in
     * the future (beyond a little clock skew) is not believed. Never a 400:
     * the field was informational before V45, and a sender that omits or
     * garbles it still has a completed attempt worth storing.
     */
    private static OffsetDateTime completedAt(String iso) {
        OffsetDateTime now = OffsetDateTime.now();
        if (iso == null || iso.isBlank()) {
            return now;
        }
        try {
            OffsetDateTime at = OffsetDateTime.parse(iso.trim());
            return at.isAfter(now.plusMinutes(5)) ? now : at;
        } catch (DateTimeParseException e) {
            return now;
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
