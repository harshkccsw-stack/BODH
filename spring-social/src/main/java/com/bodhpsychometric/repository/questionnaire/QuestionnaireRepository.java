package com.bodhpsychometric.repository.questionnaire;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.questionnaire.Questionnaire;

public interface QuestionnaireRepository extends JpaRepository<Questionnaire, Long> {

}
