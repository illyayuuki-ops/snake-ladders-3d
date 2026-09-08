package com.arena.snakesladders.model;

import com.fasterxml.jackson.annotation.JsonIgnore;

import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * Persistent player / user profile.
 * Tracks aggregate stats used by the leaderboard queries.
 */
@Entity
@Table(name = "players", uniqueConstraints = {
        @UniqueConstraint(name = "uk_player_username", columnNames = "username")
})
public class Player {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 40)
    private String username;

    @Column(name = "total_games", nullable = false)
    private int totalGames = 0;

    @Column(name = "total_wins", nullable = false)
    private int totalWins = 0;

    /** Fewest number of turns the player has ever needed to win (nullable until first win). */
    @Column(name = "fastest_win_turns")
    private Integer fastestWinTurns;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Player() {
    }

    public Player(String username) {
        this.username = username;
    }

    // ----- derived helpers (not persisted) -----

    public double getWinRate() {
        return totalGames == 0 ? 0.0 : (double) totalWins / totalGames;
    }

    // ----- getters / setters -----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public int getTotalGames() {
        return totalGames;
    }

    public void setTotalGames(int totalGames) {
        this.totalGames = totalGames;
    }

    public int getTotalWins() {
        return totalWins;
    }

    public void setTotalWins(int totalWins) {
        this.totalWins = totalWins;
    }

    public Integer getFastestWinTurns() {
        return fastestWinTurns;
    }

    public void setFastestWinTurns(Integer fastestWinTurns) {
        this.fastestWinTurns = fastestWinTurns;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
