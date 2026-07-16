package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItem;

/**
 * The usage edge. Removing a question from a questionnaire = deleting a row
 * here (children cascade); the item itself is never touched.
 */
public interface QuestionnaireItemRepository extends JpaRepository<QuestionnaireItem, Long> {

    List<QuestionnaireItem> findByQuestionnaireIdOrderBySortOrderAsc(Long questionnaireId);

    /** Take-flow fetch: usages with their immutable items in one round trip. */
    @Query("select qi from QuestionnaireItem qi join fetch qi.item"
            + " where qi.questionnaire.id = :questionnaireId order by qi.sortOrder asc")
    List<QuestionnaireItem> findWithItemsByQuestionnaireId(@Param("questionnaireId") Long questionnaireId);

    /** Where-used: every questionnaire referencing this item version. */
    List<QuestionnaireItem> findByItemId(Long itemId);

    boolean existsByItemId(Long itemId);

    Optional<QuestionnaireItem> findByQuestionnaireIdAndItemId(Long questionnaireId, Long itemId);

    boolean existsByQuestionnaireIdAndItemId(Long questionnaireId, Long itemId);

    List<QuestionnaireItem> findBySectionIdOrderBySortOrderAsc(Long sectionId);

    long countByQuestionnaireId(Long questionnaireId);
}
