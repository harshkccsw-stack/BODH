package com.bodhpsychometric.model.game;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One playable game in the catalog (V41, 2026-10-06). A GAMES question has
 * exactly one option, and that option points here — see {@code Option.game}.
 *
 * <p>The game itself is CODE, not data: it lives in one file in the portal, and
 * {@link #code} is the key the portal's hardcoded registry maps to that file.
 * Nothing about how a game plays is stored here — its timings, rounds and
 * groups belong to its file. Independent of any question, so nothing cascades
 * from it: deleting a game an option uses is pre-checked and refused.
 */
@Entity
@Table(name = "Game",
        uniqueConstraints = @UniqueConstraint(name = "uqGameCode", columnNames = "code"))
public class Game implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long gameId;

    /**
     * What the portal renders — the registry key, e.g. BASELINE. Stored upper
     * case (GameController normalises), so the registry never has to guess at
     * spelling. Frozen once the question using it has answers: changing it
     * would change which game those answers were given to.
     */
    @Column(name = "code", nullable = false, length = 50)
    private String code;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * Offered for NEW questions. A retired game is not withdrawn from the
     * questions already built on it — those keep delivering it.
     */
    @Column(name = "active", nullable = false)
    private boolean active = true;

    /**
     * Informational, starts at 1: bumped when the game's rules change in its
     * file, and recorded with every result so two versions' numbers are never
     * pooled by accident.
     */
    @Column(name = "version", nullable = false)
    private int version = 1;

    public Long getGameId() {
        return gameId;
    }

    public void setGameId(Long gameId) {
        this.gameId = gameId;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }
}
