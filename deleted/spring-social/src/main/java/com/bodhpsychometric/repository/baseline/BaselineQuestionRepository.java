package com.bodhpsychometric.repository.baseline;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.baseline.BaselineQuestion;

public interface BaselineQuestionRepository extends JpaRepository<BaselineQuestion, Long> {

    List<BaselineQuestion> findAllByOrderBySortOrderAsc();
}
