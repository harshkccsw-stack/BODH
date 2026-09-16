package com.bodhpsychometric.repository.question;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.question.Question;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    /**
     * Every question's id and stem, and nothing else. Used to tell an importer
     * that a sheet it is about to create is already in the bank — a question
     * asked over the WHOLE bank, so loading entities (and their options, and
     * their scores) to compare one string would be the wrong shape entirely.
     */
    @org.springframework.data.jpa.repository.Query(
            // questionTexString is the FIELD; "stem" is the column it maps to.
            "select q.questionId as id, q.questionTexString as stem from Question q")
    java.util.List<StemOnly> findAllStems();

    interface StemOnly {
        Long getId();

        String getStem();
    }
    // Placement queries live on QuestionnaireQuestionRepository — a bank
    // question carries no attachment state of its own.
}
