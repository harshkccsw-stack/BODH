package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireSummaryDto;

@Repository
public interface PublishedQuestionnaireRepository extends JpaRepository<PublishedQuestionnaire, String> {

    @Query("SELECT q FROM PublishedQuestionnaire q ORDER BY q.createdAt DESC")
    List<PublishedQuestionnaire> findAllOrderByCreated();

    @Query("SELECT q FROM PublishedQuestionnaire q WHERE LOWER(q.vertical) = LOWER(:v) ORDER BY q.createdAt DESC")
    List<PublishedQuestionnaire> findByVertical(@Param("v") String vertical);

    // Constructor-projection summaries for the assessment-create dropdown.
    // SIZE(q.questions) is computed via a correlated COUNT on the join table
    // so we never fetch the question/option rows themselves.
    @Query("SELECT new com.bodhpsychometric.bodhassess.payload.QuestionnaireSummaryDto(" +
           "q.id, q.name, q.shortName, q.vertical, q.category, q.duration, SIZE(q.questions)) " +
           "FROM PublishedQuestionnaire q ORDER BY q.createdAt DESC")
    List<QuestionnaireSummaryDto> findAllSummariesOrderByCreated();

    @Query("SELECT new com.bodhpsychometric.bodhassess.payload.QuestionnaireSummaryDto(" +
           "q.id, q.name, q.shortName, q.vertical, q.category, q.duration, SIZE(q.questions)) " +
           "FROM PublishedQuestionnaire q WHERE LOWER(q.vertical) = LOWER(:v) ORDER BY q.createdAt DESC")
    List<QuestionnaireSummaryDto> findSummariesByVertical(@Param("v") String vertical);

    @Query("SELECT q FROM PublishedQuestionnaire q WHERE LOWER(q.name) = LOWER(:n) OR LOWER(q.shortName) = LOWER(:n)")
    List<PublishedQuestionnaire> findByName(@Param("n") String name);

    // Returns other rows with the same name so the caller can delete them
    // via repo.delete(entity), which fires the cascade + orphanRemoval on
    // child collections (mqs, questions, languages, demographicFieldKeys).
    // A bulk JPQL DELETE would bypass that cascade and trip the FK from
    // published_questionnaire_mqs back to published_questionnaires.
    @Query("SELECT q FROM PublishedQuestionnaire q WHERE LOWER(q.name) = LOWER(:name) AND q.id <> :id")
    List<PublishedQuestionnaire> findOthersByName(@Param("name") String name, @Param("id") String id);

    // ---------- Version-aware queries (post-migration) ----------

    /** All versions of a parent, newest commit first. Drafts appear too. */
    @Query("SELECT q FROM PublishedQuestionnaire q WHERE q.parentId = :pid "
         + "ORDER BY q.versionMajor DESC, q.versionMinor DESC, q.committedAt DESC")
    List<PublishedQuestionnaire> findByParent(@Param("pid") String parentId);

    /** Only COMMITTED versions of a parent — what the assessment-create version picker needs. */
    @Query("SELECT q FROM PublishedQuestionnaire q "
         + "WHERE q.parentId = :pid AND q.versionStatus = 'COMMITTED' "
         + "ORDER BY q.versionMajor DESC, q.versionMinor DESC")
    List<PublishedQuestionnaire> findCommittedByParent(@Param("pid") String parentId);

    /** Drafts only, for the Drafts tab on the parent detail page. */
    @Query("SELECT q FROM PublishedQuestionnaire q "
         + "WHERE q.parentId = :pid AND q.versionStatus = 'DRAFT' "
         + "ORDER BY q.createdAt DESC")
    List<PublishedQuestionnaire> findDraftsByParent(@Param("pid") String parentId);

    /** Highest committed (major, minor) under a parent — drives the next-bump calc. */
    @Query("SELECT q FROM PublishedQuestionnaire q "
         + "WHERE q.parentId = :pid AND q.versionStatus = 'COMMITTED' "
         + "ORDER BY q.versionMajor DESC, q.versionMinor DESC")
    List<PublishedQuestionnaire> findLatestCommittedByParent(@Param("pid") String parentId);

    @Query("SELECT COUNT(q) FROM PublishedQuestionnaire q "
         + "WHERE q.parentId = :pid AND q.versionStatus = 'COMMITTED'")
    long countCommittedByParent(@Param("pid") String parentId);

    @Query("SELECT COUNT(q) FROM PublishedQuestionnaire q "
         + "WHERE q.parentId = :pid AND q.versionStatus = 'DRAFT'")
    long countDraftsByParent(@Param("pid") String parentId);
}
