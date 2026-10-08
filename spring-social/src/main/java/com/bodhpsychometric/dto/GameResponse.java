package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.game.Game;
import com.bodhpsychometric.model.question.Option;

/**
 * A catalog game as the dashboard reads it. {@code usedByQuestionIds} lists
 * every bank question launching it — any number since V43 — and is empty when
 * nothing uses it. A game in that list cannot be deleted.
 */
public record GameResponse(
        Long gameId,
        String code,
        String name,
        String description,
        boolean active,
        int version,
        List<Long> usedByQuestionIds) {

    /** {@code usedBy} is every option launching this game, question fetched. */
    public static GameResponse from(Game game, List<Option> usedBy) {
        return new GameResponse(
                game.getGameId(),
                game.getCode(),
                game.getName(),
                game.getDescription(),
                game.isActive(),
                game.getVersion(),
                usedBy.stream().map(o -> o.getQuestion().getQuestionId()).distinct().sorted().toList());
    }
}
