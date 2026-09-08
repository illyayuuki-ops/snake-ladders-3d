package com.arena.snakesladders.repository;

import com.arena.snakesladders.model.GameHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GameHistoryRepository extends JpaRepository<GameHistory, Long> {

    List<GameHistory> findByPlayerUsernameOrderByPlayedAtDesc(String username);

    List<GameHistory> findByPlayerIdOrderByPlayedAtDesc(Long playerId);

    long countByPlayerUsername(String username);

    @Query("SELECT gh FROM GameHistory gh WHERE gh.playerUsername = :username ORDER BY gh.playedAt DESC")
    List<GameHistory> recentForPlayer(String username);
}
