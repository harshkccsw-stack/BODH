package com.bodhpsychometric.bodhassess.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Assessment;

@Repository
public interface AssessmentRepository extends JpaRepository<Assessment, String> {

    @Query("SELECT a FROM Assessment a ORDER BY a.createdAt DESC")
    List<Assessment> findAllOrderByCreated();

    /** Used by the version detail UI to render "this version is locked
     *  in by N assessments" — also gates draft deletion when needed. */
    @Query("SELECT COUNT(a) FROM Assessment a WHERE a.questionnaireVersionId = :vid")
    long countByQuestionnaireVersionId(@Param("vid") String questionnaireVersionId);

    /** Every assessment in a questionnaire family (any pinned version),
     *  newest first. Powers the pre-publish "connected assessments" popup. */
    @Query("SELECT a FROM Assessment a WHERE a.questionnaireId = :qid ORDER BY a.createdAt DESC")
    List<Assessment> findByQuestionnaireId(@Param("qid") String questionnaireId);

    /** Of the given assessment ids, return only those that still exist. Used
     *  to drop orphaned portal sessions (whose parent assessment was deleted)
     *  from the respondent dashboard without destroying their answer data. */
    @Query("SELECT a.id FROM Assessment a WHERE a.id IN :ids")
    List<String> findExistingIds(@Param("ids") Collection<String> ids);
}
