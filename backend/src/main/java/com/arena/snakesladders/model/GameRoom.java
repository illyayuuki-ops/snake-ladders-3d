package com.arena.snakesladders.model;

import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;

import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * Persistent record of an online room. The authoritative, live game state is
 * kept in memory by the {@code GameService}; this entity stores a JSON snapshot
 * so a room can be recovered and so game states are durably persisted as required.
 */
@Entity
@Table(name = "game_rooms")
public class GameRoom {

    @Id
    @Column(name = "room_code", nullable = false, unique = true, length = 8)
    private String roomCode;

    @Column(name = "host_username", nullable = false, length = 40)
    private String hostUsername;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false)
    private GameMode mode;

    @Enumerated(EnumType.STRING)
    @Column(name = "board_variant", nullable = false)
    private BoardVariant boardVariant;

    @Enumerated(EnumType.STRING)
    @Column(name = "difficulty")
    private Difficulty difficulty;

    /** Comma separated list of participant usernames (turn order). */
    @Column(name = "players", length = 512)
    private String players;

    /** Live game state snapshot (JSON). */
    @Column(name = "state_json", columnDefinition = "TEXT")
    private String stateJson;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "WAITING";

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public GameRoom() {
    }

    public GameRoom(String roomCode, String hostUsername, GameMode mode,
                    BoardVariant boardVariant, Difficulty difficulty) {
        this.roomCode = roomCode;
        this.hostUsername = hostUsername;
        this.mode = mode;
        this.boardVariant = boardVariant;
        this.difficulty = difficulty;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public void setRoomCode(String roomCode) {
        this.roomCode = roomCode;
    }

    public String getHostUsername() {
        return hostUsername;
    }

    public void setHostUsername(String hostUsername) {
        this.hostUsername = hostUsername;
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

    public Difficulty getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(Difficulty difficulty) {
        this.difficulty = difficulty;
    }

    public String getPlayers() {
        return players;
    }

    public void setPlayers(String players) {
        this.players = players;
    }

    public String getStateJson() {
        return stateJson;
    }

    public void setStateJson(String stateJson) {
        this.stateJson = stateJson;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
