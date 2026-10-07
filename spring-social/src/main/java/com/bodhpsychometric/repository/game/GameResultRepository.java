package com.bodhpsychometric.repository.game;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.game.GameResult;

public interface GameResultRepository extends JpaRepository<GameResult, Long> {

    /** True when any result was recorded for this game — part of the game delete pre-check. */
    boolean existsByGameGameId(Long gameId);

    /**
     * Every result behind an export page — answer and game fetched, so the
     * sheet builder never lazy-loads (the answer's question and respondent
     * are only read for their ids).
     */
    @Query("select r from GameResult r join fetch r.answer a join fetch r.game "
            + "where a.assessment.assessmentId = :assessmentId and a.respondent.id in :respondentUserIds "
            + "order by a.question.questionId, r.partOrder")
    List<GameResult> findForExport(@Param("assessmentId") Long assessmentId,
            @Param("respondentUserIds") List<Long> respondentUserIds);

    /** One respondent's results for one assessment, in question then part order. */
    @Query("select r from GameResult r join fetch r.answer a "
            + "where a.respondent.id = :respondentUserId and a.assessment.assessmentId = :assessmentId "
            + "order by a.question.questionId, r.partOrder")
    List<GameResult> findForRespondentAssessment(@Param("respondentUserId") Long respondentUserId,
            @Param("assessmentId") Long assessmentId);
}
