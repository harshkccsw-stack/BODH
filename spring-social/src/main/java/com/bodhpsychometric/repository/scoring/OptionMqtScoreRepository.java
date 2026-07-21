package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.scoring.OptionMqtScore;

public interface OptionMqtScoreRepository extends JpaRepository<OptionMqtScore, Long> {

    boolean existsByOptionQuestionQuestionId(Long questionId);

    java.util.List<OptionMqtScore> findByOptionQuestionQuestionId(Long questionId);

    void deleteByOptionQuestionQuestionId(Long questionId);
}
