package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.scoring.QuestionMqtScore;

public interface QuestionMqtScoreRepository extends JpaRepository<QuestionMqtScore, Long> {

    boolean existsByQuestionQuestionId(Long questionId);

    java.util.List<QuestionMqtScore> findByQuestionQuestionId(Long questionId);

    void deleteByQuestionQuestionId(Long questionId);
}
