package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireChangeLog;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireChangeType;

/**
 * Append-only: save() is the only write anyone should ever perform here —
 * no update or delete path exists in any service.
 */
public interface QuestionnaireChangeLogRepository extends JpaRepository<QuestionnaireChangeLog, Long> {

    List<QuestionnaireChangeLog> findByQuestionnaireIdOrderByCreatedAtDesc(Long questionnaireId);

    List<QuestionnaireChangeLog> findByQuestionnaireIdAndChangeTypeOrderByCreatedAtDesc(
            Long questionnaireId, QuestionnaireChangeType changeType);

    List<QuestionnaireChangeLog> findByCreatedByIdOrderByCreatedAtDesc(Long userId);
}
