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

    /** True when some option launches this game — the delete pre-check. */
    boolean existsByGameGameId(Long gameId);

    /**
     * Every option launching this game, question fetched — one per GAMES
     * question using it (many-to-one since V43), in question order.
     */
    @Query("select o from Option o join fetch o.question where o.game.gameId = :gameId "
            + "order by o.question.questionId")
    List<Option> findByGameIdWithQuestion(@Param("gameId") Long gameId);

    /** Every option that launches a game, question and game fetched — the catalog's "used by". */
    @Query("select o from Option o join fetch o.question join fetch o.game")
    List<Option> findAllGameOptions();

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
