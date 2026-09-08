package com.arena.snakesladders.dto;

import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;
import com.arena.snakesladders.model.enums.PowerUpType;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Full, serialisable snapshot of a game. Sent to clients over REST and WebSocket.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class GameStateResponse {

    public enum GameStatus { WAITING, PLAYING, FINISHED }

    public enum MoveKind { MOVE, CLIMB, SLIDE, BOUNCE, SHIELD, WIN }

    public static class PlayerState {
        public String name;
        public boolean ai;
        public Difficulty difficulty;
        public String color;
        public int position;
        public boolean shield;
        public boolean hasDouble;
        public boolean hasFreeze;
        public int frozen;
        public boolean finished;
        public int placement;
        public boolean isCurrent;
    }

    public static class MoveEvent {
        public MoveKind kind;
        public String player;
        public int from;
        public int to;
        public List<Integer> path = new ArrayList<>();
        public PowerUpType powerUp;
        public String message;
    }

    public String roomCode;
    public GameMode mode;
    public BoardVariant variant;
    public Difficulty difficulty;
    public int size;
    public int currentTurn;
    public String currentPlayerName;
    public int dice;
    public int turnCount;
    public GameStatus status;
    public String winner;
    public int boardSequence;
    public boolean boardChanged;

    public Map<Integer, Integer> snakes = new LinkedHashMap<>();
    public Map<Integer, Integer> ladders = new LinkedHashMap<>();
    public Map<Integer, String> powerups = new LinkedHashMap<>();

    public List<PlayerState> players = new ArrayList<>();
    public MoveEvent lastEvent;
    public List<String> log = new ArrayList<>();

    /** Echoed to the requesting client; null when broadcast to a room. */
    public String yourName;

    public GameStateResponse() {
    }
}
