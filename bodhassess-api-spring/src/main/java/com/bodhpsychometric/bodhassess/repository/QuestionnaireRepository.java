package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Questionnaire;

/**
 * Parents — one row per questionnaire family (PHQ-9, GAD-7, …). The
 * actual content / answers / scoring lives in the version rows
 * ({@link com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire}).
 */
@Repository
public interface QuestionnaireRepository extends JpaRepository<Questionnaire, String> {

    @Query("SELECT q FROM Questionnaire q ORDER BY q.createdAt DESC")
    List<Questionnaire> findAllOrderByCreated();
}
