package com.bodhpsychometric.repository.question;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.question.Question;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    java.util.List<Question> findByQuestionnaireQuestionnaireIdOrderBySortOrderAscQuestionIdAsc(Long questionnaireId);

    java.util.List<Question> findBySectionSectionId(Long sectionId);
}
