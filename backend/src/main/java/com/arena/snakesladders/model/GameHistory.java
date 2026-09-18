package com.arena.snakesladders.model;

import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * Persistent record of a single game match for a player.
 * Tracks details needed for the admin play-history calendar/report.
 */
@Entity
@Table(name = "game_history")
public class GameHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false, length = 40)
    private String username;

    @Column(name = "won", nullable = false)
    private boolean won;

    @Column(name = "mode", nullable = false, length = 20)
    private String mode;

    @Column(name = "variant", nullable = false, length = 20)
    private String variant;

    @Column(name = "turns", nullable = false)
    private int turns;

    @Column(name = "placement", nullable = false)
    private int placement;

    @Column(name = "played_at", nullable = false)
    private LocalDateTime playedAt;

    public GameHistory() {
    }

    public GameHistory(String username, String mode, String variant, boolean won, int turns, int placement, LocalDateTime playedAt) {
        this.username = username;
        this.mode = mode;
        this.variant = variant;
        this.won = won;
        this.turns = turns;
        this.placement = placement;
        this.playedAt = playedAt;
    }

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

    public boolean isWon() {
        return won;
    }

    public void setWon(boolean won) {
        this.won = won;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getVariant() {
        return variant;
    }

    public void setVariant(String variant) {
        this.variant = variant;
    }

    public int getTurns() {
        return turns;
    }

    public void setTurns(int turns) {
        this.turns = turns;
    }

    public int getPlacement() {
        return placement;
    }

    public void setPlacement(int placement) {
        this.placement = placement;
    }

    public LocalDateTime getPlayedAt() {
        return playedAt;
    }

    public void setPlayedAt(LocalDateTime playedAt) {
        this.playedAt = playedAt;
    }
}