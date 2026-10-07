package com.bodhpsychometric.repository.question;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;

public interface OptionRepository extends JpaRepository<Option, Long> {

    @Query("select o from Option o where o.question.questionId in :questionIds "
            + "and o.question.questionType = :type and o.contentType = :kind")
    List<Option> findByQuestionIdsTypeAndKind(@Param("questionIds") Collection<Long> questionIds,
            @Param("type") QuestionType type, @Param("kind") ContentType kind);

    /**
     * questionId → the generated text-slot option of each SHORT_ANSWER among
     * them (see Question.textAnswerOption). A question with none is simply
     * absent, and the answer is then stored without an option, as before V40.
     */
    default Map<Long, Option> findTextAnswerOptions(Collection<Long> questionIds) {
        Map<Long, Option> byQuestion = new HashMap<>();
        if (questionIds == null || questionIds.isEmpty()) {
            return byQuestion;
        }
        for (Option o : findByQuestionIdsTypeAndKind(questionIds, QuestionType.SHORT_ANSWER, ContentType.FREE_TEXT)) {
            byQuestion.putIfAbsent(o.getQuestion().getQuestionId(), o);
        }
        return byQuestion;
    }
}
