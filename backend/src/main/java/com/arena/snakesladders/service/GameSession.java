package com.arena.snakesladders.service;

import com.arena.snakesladders.dto.GameStateResponse;
import com.arena.snakesladders.model.Board;
import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;

import java.util.ArrayList;
import java.util.List;

/**
 * Live, in-memory game session. Holds the board, seats and turn pointer plus the
 * log + last move event used for animations. Snapshot to {@link GameStateResponse}.
 */
public class GameSession {

    public final String roomCode;
    public final GameMode mode;
    public final BoardVariant variant;
    public final Difficulty difficulty;

    public Board board;
    public final List<PlayerSeat> seats = new ArrayList<>();
    public int currentIndex = 0;
    public int dice = 0;
    public int turnCount = 0;
    public GameStateResponse.GameStatus status = GameStateResponse.GameStatus.WAITING;
    public String winner;
    public GameStateResponse.MoveEvent lastEvent;
    public final List<String> log = new ArrayList<>();

    public int finishedCount = 0;
    public int boardSequence = 0;
    public boolean boardChanged = false;
    public final Object lock = new Object();

    public GameSession(String roomCode, GameMode mode, BoardVariant variant, Difficulty difficulty) {
        this.roomCode = roomCode;
        this.mode = mode;
        this.variant = variant;
        this.difficulty = difficulty;
    }

    public PlayerSeat current() {
        if (seats.isEmpty()) throw new IllegalStateException("No players in session");
        return seats.get(currentIndex);
    }

    public PlayerSeat seatByName(String name) {
        for (PlayerSeat s : seats) {
            if (s.name.equalsIgnoreCase(name)) return s;
        }
        return null;
    }

    public void advanceTurn() {
        int n = seats.size();
        for (int step = 1; step <= n; step++) {
            int idx = (currentIndex + step) % n;
            if (!seats.get(idx).finished) {
                currentIndex = idx;
                return;
            }
        }
        // everyone finished
        currentIndex = (currentIndex + 1) % n;
    }
}
