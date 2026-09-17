package com.bodhpsychometric.repository.baseline;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.baseline.BaselineAnswer;

public interface BaselineAnswerRepository extends JpaRepository<BaselineAnswer, Long> {

    /** The pre-check that blocks deleting a question someone has answered. */
    boolean existsByQuestion_BaselineQuestionId(Long baselineQuestionId);

    @Query("select a from BaselineAnswer a join fetch a.question where a.respondent.id = :respondentId")
    List<BaselineAnswer> findByRespondentWithQuestion(@Param("respondentId") Long respondentId);

    /** A respondent delete clears these first — nothing cascades here. */
    void deleteByRespondent_Id(Long respondentId);
}
