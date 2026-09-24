package com.arena.snakesladders.repository;

import com.arena.snakesladders.model.GameHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface GameHistoryRepository extends JpaRepository<GameHistory, Long> {

    /** Fetch all history within a date range, ordered by playedAt descending. */
    List<GameHistory> findByPlayedAtBetweenOrderByPlayedAtDesc(LocalDateTime start, LocalDateTime end);

    /** Fetch history for a specific player within a date range. */
    List<GameHistory> findByUsernameAndPlayedAtBetweenOrderByPlayedAtDesc(String username, LocalDateTime start, LocalDateTime end);

    /** Delete all history records for a given username (case-insensitive). Used for demo-data cleanup. */
    void deleteByUsernameIgnoreCase(String username);

    /** Count history records for a specific username. */
    long countByUsernameIgnoreCase(String username);
}