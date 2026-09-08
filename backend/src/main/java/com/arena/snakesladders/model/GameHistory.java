package com.arena.snakesladders.model;

import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.GameMode;
import com.fasterxml.jackson.annotation.JsonIgnore;

import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * One finished match result for one player.
 * Enables per-player history and global leaderboard analytics.
 */
@Entity
@Table(name = "game_history")
public class GameHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false)
    private Player player;

    /** Denormalised username for quick reporting without a join. */
    @Column(name = "player_username", nullable = false, length = 40)
    private String playerUsername;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false)
    private GameMode mode;

    @Enumerated(EnumType.STRING)
    @Column(name = "board_variant", nullable = false)
    private BoardVariant boardVariant;

    @Column(nullable = false)
    private boolean won;

    /** Total turns taken by this player during the match. */
    @Column(nullable = false)
    private int turns;

    /** Final placement (1 = winner, 2 = second, ...). */
    @Column(nullable = false)
    private int placement;

    @Column(name = "played_at", nullable = false, updatable = false)
    private LocalDateTime playedAt = LocalDateTime.now();

    public GameHistory() {
    }

    public GameHistory(Player player, GameMode mode, BoardVariant boardVariant,
                       boolean won, int turns, int placement) {
        this.player = player;
        this.playerUsername = player.getUsername();
        this.mode = mode;
        this.boardVariant = boardVariant;
        this.won = won;
        this.turns = turns;
        this.placement = placement;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Player getPlayer() {
        return player;
    }

    public void setPlayer(Player player) {
        this.player = player;
    }

    public String getPlayerUsername() {
        return playerUsername;
    }

    public void setPlayerUsername(String playerUsername) {
        this.playerUsername = playerUsername;
    }

    public GameMode getMode() {
        return mode;
    }

    public void setMode(GameMode mode) {
        this.mode = mode;
    }

    public BoardVariant getBoardVariant() {
        return boardVariant;
    }

    public void setBoardVariant(BoardVariant boardVariant) {
        this.boardVariant = boardVariant;
    }

    public boolean isWon() {
        return won;
    }

    public void setWon(boolean won) {
        this.won = won;
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
