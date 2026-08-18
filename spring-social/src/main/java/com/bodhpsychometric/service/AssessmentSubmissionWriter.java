package com.bodhpsychometric.service;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;
import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * The ONE writer of a final answer set into MySQL, shared by the two paths a
 * submission can arrive on: the digest draining a Redis-staged envelope, and
 * the synchronous fallback submit takes when Redis would not hold the
 * envelope. Both hand over the same thing — entries the submit validator has
 * already normalized (deduped per (question,row,option), text trimmed) — so
 * the write is mechanical: replace-all, then COMPLETED + isPersisted.
 *
 * <p>Entities are referenced by id ({@code getReference}), not loaded: the
 * ids were validated against the questionnaire content at submit time, and
 * the answer table's FKs are the durable re-check. That keeps the digest's
 * MySQL footprint to the mapping row, one delete, and the inserts.
 */
@Service
public class AssessmentSubmissionWriter {

    private final RespondentAssessmentMappingRepository mappings;
    private final AssessmentAnswerRepository assessmentAnswers;

    @PersistenceContext
    private EntityManager entityManager;

    public AssessmentSubmissionWriter(RespondentAssessmentMappingRepository mappings,
            AssessmentAnswerRepository assessmentAnswers) {
        this.mappings = mappings;
        this.assessmentAnswers = assessmentAnswers;
    }

    /**
     * All-or-nothing: the replace-all delete, every insert, and the status
     * flip commit together — isPersisted can never claim rows that are not
     * there. Idempotent on an attempt that is already COMPLETED+persisted
     * (a digest retry racing a finished one), and 404 when the mapping was
     * deleted since staging, which the digest treats as terminal.
     */
    @Transactional
    public RespondentAssessmentMapping persist(Long mappingId, List<AnswerEntry> entries, int popUpCount) {
        RespondentAssessmentMapping mapping = mappings.findForPortalDelivery(mappingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Assessment attempt " + mappingId + " not found"));
        if (mapping.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED && mapping.isPersisted()) {
            return mapping;
        }

        Long respondentUserId = mapping.getRespondent().getId();
        Long assessmentId = mapping.getAssessment().getAssessmentId();
        // Replace-all write of the pair's single answer set. Flush the deletes
        // before inserting, or Hibernate orders the inserts first and trips
        // the unique tuple on a re-attempt.
        assessmentAnswers.deleteByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessmentId);
        assessmentAnswers.flush();

        for (AnswerEntry entry : entries) {
            AssessmentAnswer answer = new AssessmentAnswer();
            answer.setRespondent(mapping.getRespondent());
            answer.setAssessment(mapping.getAssessment());
            answer.setQuestion(entityManager.getReference(Question.class, entry.questionId()));
            if (entry.optionId() != null) {
                answer.setOption(entityManager.getReference(Option.class, entry.optionId()));
            }
            if (entry.questionRowId() != null) {
                answer.setQuestionRow(entityManager.getReference(QuestionRow.class, entry.questionRowId()));
            }
            if (entry.answerText() != null) {
                answer.setAnswerText(entry.answerText());
            }
            assessmentAnswers.save(answer);
        }
        // Force the answer inserts now, so isPersisted is only ever set after
        // the rows have actually reached MySQL — a failure here rolls the
        // whole write back rather than reporting a durable write that never
        // happened.
        assessmentAnswers.flush();

        mapping.setAssessmentStatus(RespondentAssessmentStatus.COMPLETED);
        mapping.setPersisted(true);
        mapping.setPopUpCount(Math.max(0, popUpCount));
        return mappings.save(mapping);
    }
}
