package com.bodhpsychometric.service;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;
import com.bodhpsychometric.dto.PortalSubmitRequest.GamePartEntry;
import com.bodhpsychometric.dto.PortalSubmitRequest.GameResultEntry;
import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.game.Game;
import com.bodhpsychometric.model.game.GameResult;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.game.GameResultRepository;
import com.bodhpsychometric.repository.question.OptionRepository;

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
    private final OptionRepository options;
    private final GameResultRepository gameResults;

    @PersistenceContext
    private EntityManager entityManager;

    public AssessmentSubmissionWriter(RespondentAssessmentMappingRepository mappings,
            AssessmentAnswerRepository assessmentAnswers, OptionRepository options,
            GameResultRepository gameResults) {
        this.mappings = mappings;
        this.assessmentAnswers = assessmentAnswers;
        this.options = options;
        this.gameResults = gameResults;
    }

    /**
     * All-or-nothing: the replace-all delete, every insert, and the status
     * flip commit together — isPersisted can never claim rows that are not
     * there. Idempotent on an attempt that is already COMPLETED+persisted
     * (a digest retry racing a finished one), and 404 when the mapping was
     * deleted since staging, which the digest treats as terminal.
     *
     * <p>{@code completedAt} is when the submit reached the server — the
     * digest passes the time staged in the envelope, so a delayed or retried
     * write still records the respondent's moment. Null means now.
     */
    @Transactional
    public RespondentAssessmentMapping persist(Long mappingId, List<AnswerEntry> entries, int popUpCount,
            List<GameResultEntry> games, OffsetDateTime completedAt) {
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
        // the unique tuple on a re-attempt. The previous set's game results
        // go with it — game_result cascades on delete in the database (V44).
        assessmentAnswers.deleteByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessmentId);
        assessmentAnswers.flush();

        // A short answer is stored on its question's generated text-slot
        // option (V40). The portal never sees that option, so its entry
        // carries text only; this is the one place every portal submission
        // is written, including ones staged before V40, so it attaches here.
        Set<Long> textOnly = entries.stream()
                .filter(e -> e.optionId() == null && e.questionRowId() == null)
                .map(AnswerEntry::questionId)
                .collect(Collectors.toSet());
        Map<Long, Option> textSlots = options.findTextAnswerOptions(textOnly);

        // The row each game question was answered with — a GAMES question has
        // exactly one — for its results to hang off.
        Map<Long, AssessmentAnswer> answerByQuestion = new HashMap<>();
        for (AnswerEntry entry : entries) {
            AssessmentAnswer answer = new AssessmentAnswer();
            answer.setRespondent(mapping.getRespondent());
            answer.setAssessment(mapping.getAssessment());
            answer.setQuestion(entityManager.getReference(Question.class, entry.questionId()));
            if (entry.optionId() != null) {
                answer.setOption(entityManager.getReference(Option.class, entry.optionId()));
            } else if (entry.questionRowId() == null) {
                answer.setOption(textSlots.get(entry.questionId()));
            }
            if (entry.questionRowId() != null) {
                answer.setQuestionRow(entityManager.getReference(QuestionRow.class, entry.questionRowId()));
            }
            if (entry.answerText() != null) {
                answer.setAnswerText(entry.answerText());
            }
            assessmentAnswers.save(answer);
            answerByQuestion.putIfAbsent(entry.questionId(), answer);
        }
        // Force the answer inserts now, so isPersisted is only ever set after
        // the rows have actually reached MySQL — a failure here rolls the
        // whole write back rather than reporting a durable write that never
        // happened.
        assessmentAnswers.flush();

        // The finished games' numbers, one row per part, each attached to the
        // answer its game produced — inside this same transaction, so a game's
        // results never land without its answer or the answer without them.
        // The submit validator already tied every result to an answered game
        // question; a result with no answer here could only come from an
        // envelope tampered with in Redis, and is skipped rather than allowed
        // to fail the digest forever.
        for (GameResultEntry game : games == null ? List.<GameResultEntry>of() : games) {
            AssessmentAnswer answer = answerByQuestion.get(game.questionId());
            if (answer == null || game.gameId() == null || game.parts() == null) {
                continue;
            }
            for (int i = 0; i < game.parts().size(); i++) {
                gameResults.save(toRow(answer, game, game.parts().get(i), i + 1));
            }
        }
        gameResults.flush();

        mapping.setAssessmentStatus(RespondentAssessmentStatus.COMPLETED);
        mapping.setPersisted(true);
        mapping.setPopUpCount(Math.max(0, popUpCount));
        mapping.setCompletedAt(completedAt != null ? completedAt : OffsetDateTime.now());
        return mappings.save(mapping);
    }

    /** One game part as its game_result row; the entry was validated at submit. */
    private GameResult toRow(AssessmentAnswer answer, GameResultEntry game, GamePartEntry part, int order) {
        GameResult row = new GameResult();
        row.setAnswer(answer);
        row.setGame(entityManager.getReference(Game.class, game.gameId()));
        row.setGameVersion(game.gameVersion() == null ? 1 : game.gameVersion());
        row.setPartCode(part.partCode());
        row.setPartOrder(order);
        row.setHits(part.hits());
        row.setFalseAlarms(part.falseAlarms());
        row.setOmissions(part.omissions());
        row.setDurationMs(part.durationMs());
        row.setMouseDistancePx(part.mouseDistancePx());
        row.setMouseIdleSeconds(part.mouseIdleSeconds());
        row.setInstructionTimeMs(part.instructionTimeMs());
        row.setGroupNumber(part.groupNumber());
        row.setGroupName(part.groupName());
        row.setPauseCount(part.pauseCount());
        row.setPauseDurationMs(part.pauseDurationMs());
        row.setStartedAt(part.startedAt());
        row.setEndedAt(part.endedAt());
        return row;
    }
}
