package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire;

@Repository
public interface PublishedQuestionnaireRepository extends JpaRepository<PublishedQuestionnaire, String> {

    @Query("SELECT q FROM PublishedQuestionnaire q ORDER BY q.createdAt DESC")
    List<PublishedQuestionnaire> findAllOrderByCreated();

    @Query("SELECT q FROM PublishedQuestionnaire q WHERE LOWER(q.vertical) = LOWER(:v) ORDER BY q.createdAt DESC")
    List<PublishedQuestionnaire> findByVertical(@Param("v") String vertical);

    @Query("SELECT q FROM PublishedQuestionnaire q WHERE LOWER(q.name) = LOWER(:n) OR LOWER(q.shortName) = LOWER(:n)")
    List<PublishedQuestionnaire> findByName(@Param("n") String name);

    // Returns other rows with the same name so the caller can delete them
    // via repo.delete(entity), which fires the cascade + orphanRemoval on
    // child collections (mqs, questions, languages, demographicFieldKeys).
    // A bulk JPQL DELETE would bypass that cascade and trip the FK from
    // published_questionnaire_mqs back to published_questionnaires.
    @Query("SELECT q FROM PublishedQuestionnaire q WHERE LOWER(q.name) = LOWER(:name) AND q.id <> :id")
    List<PublishedQuestionnaire> findOthersByName(@Param("name") String name, @Param("id") String id);
}
