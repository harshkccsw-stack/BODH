package com.bodhpsychometric.repository.question;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.question.Question;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    /**
     * Every question's id and stem, and nothing else. Used to tell an importer
     * that a sheet it is about to create is already in the bank — a question
     * asked over the WHOLE bank, so loading entities (and their options, and
     * their scores) to compare one string would be the wrong shape entirely.
     * Group members excluded: a sheet row matching a stem that lives inside a
     * group could not be de-duplicated against it anyway (members are only
     * authored through their group).
     */
    @org.springframework.data.jpa.repository.Query(
            // questionTexString is the FIELD; "stem" is the column it maps to.
            "select q.questionId as id, q.questionTexString as stem from Question q "
                    + "where q.parentQuestion is null")
    java.util.List<StemOnly> findAllStems();

    /**
     * The bank as the dashboard lists it: top-level questions only. A GROUP's
     * members are authored and read through their parent, never as rows of
     * their own.
     */
    java.util.List<Question> findByParentQuestionIsNull();

    /** A group's members, in their authored order. */
    java.util.List<Question> findByParentQuestionQuestionIdOrderByGroupSortOrderAscQuestionIdAsc(
            Long parentQuestionId);

    boolean existsByParentQuestionQuestionId(Long parentQuestionId);

    interface StemOnly {
        Long getId();

        String getStem();
    }
    // Placement queries live on QuestionnaireQuestionRepository — a bank
    // question carries no attachment state of its own.
}
