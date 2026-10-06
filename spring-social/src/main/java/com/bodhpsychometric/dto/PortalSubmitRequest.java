package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Payload for the once-and-for-all answer submission: one entry per question,
 * every placed question answered. Elements are validated in pass 1 before
 * anything is written (bulk convention — @Valid cannot reach list elements).
 *
 * {@code popUpCount} is the attempt-level tally of inactivity "focus" popups
 * dismissed in the portal — nullable/optional (treated as 0 when absent), so
 * older clients that never send it keep working.
 */
public record PortalSubmitRequest(
        List<AnswerEntry> answers,
        Integer popUpCount,
        /**
         * What each finished game measured — at most one entry per GAMES
         * question, and only for a question answered with its game option
         * (the answer IS the proof the game was finished). Optional: absent,
         * null or missing for a game is accepted, the answer row still stands.
         * Written in the SAME transaction as the answers (V43 game_result).
         */
        List<GameResultEntry> gameResults) {

    /**
     * {@code questionRowId} is which grid ROW this rating answers. Nullable,
     * and null for every question type but LIKERT_GRID — so a client written
     * before grids existed keeps sending exactly what it always sent. The
     * submit validator refuses the two ways round it can be wrong: a grid
     * answer without a row, and a row on a question that has none.
     *
     * {@code answerText} is the SHORT_ANSWER payload and the mirror image:
     * required on that type, where optionId is null, and refused on every
     * other, where an option is what an answer is. One entry per question —
     * a second is a 400 rather than a silent overwrite.
     */
    public record AnswerEntry(Long questionId, Long optionId, Long questionRowId, String answerText) {
    }

    /**
     * One finished game: the GAMES question it answered, and one entry per
     * PART of the game in the order played. {@code gameId} and
     * {@code gameVersion} are filled by the SERVER from the content the
     * attempt was delivered — whatever a client sends there is overwritten —
     * so the staged envelope carries them to the writer.
     */
    public record GameResultEntry(Long questionId, Long gameId, Integer gameVersion, List<GamePartEntry> parts) {
    }

    /**
     * One part of a game, in game_result's column shape. The six core
     * metrics are required; the rest are null when the part does not measure
     * them. Times are milliseconds, timestamps the browser's clock.
     */
    public record GamePartEntry(
            String partCode,
            Integer hits,
            Integer falseAlarms,
            Integer omissions,
            Long durationMs,
            Long mouseDistancePx,
            Integer mouseIdleSeconds,
            Long instructionTimeMs,
            Integer groupNumber,
            String groupName,
            Integer pauseCount,
            Long pauseDurationMs,
            OffsetDateTime startedAt,
            OffsetDateTime endedAt) {
    }
}
