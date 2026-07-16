package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.item.AnswerOption;

/**
 * Options are created with their item and frozen; this exists for read paths
 * (delivery, scoring, copy-on-write remapping), not for editing.
 */
public interface AnswerOptionRepository extends JpaRepository<AnswerOption, Long> {

    List<AnswerOption> findByItemIdOrderBySortOrderAsc(Long itemId);

    long countByItemId(Long itemId);
}
