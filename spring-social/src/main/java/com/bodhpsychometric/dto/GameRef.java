package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.game.Game;

/**
 * The game an option launches, as it rides on an option payload — the
 * dashboard's QuestionOptionResponse and the portal's PortalOption. Null on
 * every option that is not a game.
 *
 * <p>{@code code} is what the portal's registry maps to a component;
 * {@code version} travels so a recorded result can say which version of the
 * game produced it. The catalog description is deliberately absent: it is
 * written for authors, and what the respondent reads is the question's own
 * stem and description.
 */
public record GameRef(Long gameId, String code, String name, int version) {

    public static GameRef from(Game game) {
        return game == null ? null
                : new GameRef(game.getGameId(), game.getCode(), game.getName(), game.getVersion());
    }
}
