package com.bodhpsychometric.controller.game;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.GameRequest;
import com.bodhpsychometric.dto.GameResponse;
import com.bodhpsychometric.model.game.Game;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.game.GameRepository;
import com.bodhpsychometric.repository.game.GameResultRepository;
import com.bodhpsychometric.repository.question.OptionRepository;
import com.bodhpsychometric.service.PortalContentService;

import jakarta.validation.Valid;

/**
 * The game catalog (V42). A game is CODE in the portal — one file each — and
 * this table names them: {@code code} is the registry key the portal renders
 * by. Attaching a game to a question is the question flow's job
 * (QuestionController, {@code QuestionRequest.gameId}), not this controller's.
 *
 * Conflicts are PRE-checked, never caught from the flush: a constraint
 * violation inside @Transactional marks the transaction rollback-only and the
 * 409 would die at commit as a 500.
 */
@RestController
@RequestMapping("/api/games")
@Transactional
public class GameController {

    @Autowired
    private GameRepository gameRepository;

    @Autowired
    private OptionRepository optionRepository;

    @Autowired
    private AssessmentAnswerRepository assessmentAnswerRepository;

    @Autowired
    private GameResultRepository gameResultRepository;

    // A game's name, code and version ride on the portal's cached content
    // (PortalOption.game), so an edit evicts the questionnaires placing every
    // question that launches it. Delete needs no hook: a game in use cannot be
    // deleted.
    @Autowired
    private PortalContentService portalContentService;

    @GetMapping("/getAll")
    public List<GameResponse> getAllGames() {
        Map<Long, List<Option>> usedBy = optionRepository.findAllGameOptions().stream()
                .collect(Collectors.groupingBy(o -> o.getGame().getGameId()));
        return gameRepository.findAllByOrderByNameAsc().stream()
                .map(g -> GameResponse.from(g, usedBy.getOrDefault(g.getGameId(), List.of())))
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<GameResponse> getGameById(@PathVariable Long id) {
        return gameRepository.findById(id)
                .map(g -> ResponseEntity.ok(GameResponse.from(g, optionRepository.findByGameIdWithQuestion(id))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createGame(@Valid @RequestBody GameRequest request) {
        String code = normalisedCode(request.code());
        if (gameRepository.existsByCodeIgnoreCase(code)) {
            return conflict("A game with code " + code + " already exists");
        }
        Game game = new Game();
        game.setCode(code);
        game.setActive(request.active() == null || request.active());
        game.setVersion(request.version() == null ? 1 : request.version());
        applyText(game, request);
        gameRepository.save(game);
        return ResponseEntity.status(HttpStatus.CREATED).body(GameResponse.from(game, List.of()));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateGame(@PathVariable Long id, @Valid @RequestBody GameRequest request) {
        Game game = gameRepository.findById(id).orElse(null);
        if (game == null) {
            return ResponseEntity.notFound().build();
        }
        String code = normalisedCode(request.code());
        if (gameRepository.existsByCodeIgnoreCaseAndGameIdNot(code, id)) {
            return conflict("A game with code " + code + " already exists");
        }
        // The code decides WHICH game the portal renders. Once ANY question
        // launching it has answers, renaming the code would quietly change the
        // game those answers were given to — the same reason an answered
        // question's options are frozen.
        if (!code.equals(game.getCode()) && assessmentAnswerRepository.existsByOptionGameGameId(id)) {
            return conflict("A question using this game already has responses — its code is locked");
        }
        game.setCode(code);
        // Omitted means unchanged on an update — a caller that only renames a
        // game must not retire it or reset its version by leaving them out.
        if (request.active() != null) {
            game.setActive(request.active());
        }
        if (request.version() != null) {
            game.setVersion(request.version());
        }
        applyText(game, request);
        gameRepository.save(game);
        List<Option> usedBy = optionRepository.findByGameIdWithQuestion(id);
        usedBy.forEach(o -> portalContentService.evictForQuestion(o.getQuestion().getQuestionId()));
        return ResponseEntity.ok(GameResponse.from(game, usedBy));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteGame(@PathVariable Long id) {
        if (!gameRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        List<Long> usedBy = optionRepository.findByGameIdWithQuestion(id).stream()
                .map(o -> o.getQuestion().getQuestionId())
                .distinct()
                .toList();
        if (!usedBy.isEmpty()) {
            return conflict("This game is used by " + (usedBy.size() == 1 ? "question #" : "questions #")
                    + usedBy.stream().map(String::valueOf).collect(Collectors.joining(", #"))
                    + " — give " + (usedBy.size() == 1 ? "that question" : "those questions")
                    + " another game, or delete " + (usedBy.size() == 1 ? "it" : "them") + ", first");
        }
        // Results always hang off an answer whose (frozen) option names this
        // game, so the check above already covers them — this one only keeps
        // fkGrGame from ever surfacing as a 500.
        if (gameResultRepository.existsByGameGameId(id)) {
            return conflict("This game has recorded results — retire it instead of deleting it");
        }
        gameRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /** Trimmed and upper case — the one spelling the portal's registry keys on. */
    private static String normalisedCode(String code) {
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private static void applyText(Game game, GameRequest request) {
        game.setName(request.name().trim());
        game.setDescription(request.description() == null || request.description().isBlank()
                ? null : request.description().trim());
    }

    private static ResponseEntity<Map<String, String>> conflict(String message) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", message));
    }
}
