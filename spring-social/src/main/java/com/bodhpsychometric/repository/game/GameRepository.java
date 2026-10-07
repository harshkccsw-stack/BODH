package com.bodhpsychometric.repository.game;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.game.Game;

public interface GameRepository extends JpaRepository<Game, Long> {

    List<Game> findAllByOrderByNameAsc();

    boolean existsByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCaseAndGameIdNot(String code, Long gameId);
}
