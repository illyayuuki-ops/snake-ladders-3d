package com.arena.snakesladders.dto;

import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;

import javax.validation.Valid;
import javax.validation.constraints.NotNull;
import java.util.ArrayList;
import java.util.List;

public class CreateGameRequest {

    @NotNull
    private GameMode mode;

    @NotNull
    private BoardVariant variant;

    private Difficulty difficulty = Difficulty.EASY;

    /** For ONLINE rooms, an explicit room code (otherwise one is generated). */
    private String roomCode;

    private String hostUsername;

    @Valid
    private List<SeatRequest> players = new ArrayList<>();

    public static class SeatRequest {
        @NotNull
        private String name;
        private boolean ai = false;
        private Difficulty difficulty = Difficulty.EASY;
        /** Preferred colour hex (optional). */
        private String color;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public boolean isAi() {
            return ai;
        }

        public void setAi(boolean ai) {
            this.ai = ai;
        }

        public Difficulty getDifficulty() {
            return difficulty;
        }

        public void setDifficulty(Difficulty difficulty) {
            this.difficulty = difficulty;
        }

        public String getColor() {
            return color;
        }

        public void setColor(String color) {
            this.color = color;
        }
    }

    public GameMode getMode() {
        return mode;
    }

    public void setMode(GameMode mode) {
        this.mode = mode;
    }

    public BoardVariant getVariant() {
        return variant;
    }

    public void setVariant(BoardVariant variant) {
        this.variant = variant;
    }

    public Difficulty getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(Difficulty difficulty) {
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

    public List<SeatRequest> getPlayers() {
        return players;
    }

    public void setPlayers(List<SeatRequest> players) {
        this.players = players;
    }
}
