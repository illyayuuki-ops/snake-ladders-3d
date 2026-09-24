package com.arena.snakesladders.controller;

import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * REST endpoints for room management (create, join, start, close).
 * The actual game session lives in WebSocketController and is created on START.
 */
@RestController
@RequestMapping("/api")
public class RoomController {

    private final WebSocketController wsController;

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    public RoomController(WebSocketController wsController) {
        this.wsController = wsController;
    }

    static class Room {
        String code;
        String hostUsername;
        GameMode mode;
        BoardVariant variant;
        Difficulty difficulty;
        List<Map<String, Object>> players = new ArrayList<>();
        long createdAt;
    }

    /** Create a new room and return the room code. */
    @PostMapping("/rooms")
    public ResponseEntity<Map<String, Object>> createRoom(@RequestBody Map<String, String> body) {
        String username = body.getOrDefault("username", "Player");
        String modeStr = body.getOrDefault("mode", "ONLINE");
        String variantStr = body.getOrDefault("variant", "CLASSIC");

        GameMode mode = GameMode.valueOf(modeStr.toUpperCase());
        BoardVariant variant = BoardVariant.valueOf(variantStr.toUpperCase());
        Difficulty difficulty = Difficulty.valueOf(body.getOrDefault("difficulty", "EASY").toUpperCase());

        // Generate a unique 6-digit room code
        String code;
        do {
            code = String.valueOf(100000 + new Random().nextInt(900000));
        } while (rooms.containsKey(code));

        Room room = new Room();
        room.code = code;
        room.hostUsername = username;
        room.mode = mode;
        room.variant = variant;
        room.difficulty = difficulty;
        room.createdAt = System.currentTimeMillis();

        Map<String, Object> player = new HashMap<>();
        player.put("username", username);
        player.put("host", true);
        room.players.add(player);

        rooms.put(code, room);

        Map<String, Object> result = new HashMap<>();
        result.put("roomCode", code);
        result.put("hostUsername", username);
        result.put("mode", mode.name());
        result.put("variant", variant.name());
        return ResponseEntity.ok(result);
    }

    /** Join an existing room by code. */
    @PostMapping("/rooms/join")
    public ResponseEntity<Map<String, Object>> joinRoom(@RequestBody Map<String, String> body) {
        String code = body.getOrDefault("code", "").toUpperCase();
        String username = body.getOrDefault("username", "Player");

        Room room = rooms.get(code);
        if (room == null) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", "Room not found");
            return ResponseEntity.badRequest().body(err);
        }

        Map<String, Object> player = new HashMap<>();
        player.put("username", username);
        player.put("host", false);
        room.players.add(player);

        Map<String, Object> result = new HashMap<>();
        result.put("roomCode", code);
        result.put("hostUsername", room.hostUsername);
        result.put("mode", room.mode.name());
        result.put("variant", room.variant.name());
        return ResponseEntity.ok(result);
    }

    /** Check if a room exists and is still active. */
    @GetMapping("/rooms/{code}")
    public ResponseEntity<Map<String, Object>> getRoom(@PathVariable String code) {
        Room room = rooms.get(code.toUpperCase());
        if (room == null) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", "Room not found");
            return ResponseEntity.badRequest().body(err);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("roomCode", room.code);
        result.put("hostUsername", room.hostUsername);
        result.put("mode", room.mode.name());
        result.put("variant", room.variant.name());
        result.put("playerCount", room.players.size());
        result.put("players", room.players);
        result.put("ageSeconds", (System.currentTimeMillis() - room.createdAt) / 1000);
        return ResponseEntity.ok(result);
    }

    /** Host starts the game: creates authoritative session in WebSocketController and broadcasts initial state. */
    @PostMapping("/rooms/{code}/start")
    public ResponseEntity<Map<String, Object>> startRoom(@PathVariable String code) {
        Room room = rooms.get(code.toUpperCase());
        if (room == null) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", "Room not found");
            return ResponseEntity.badRequest().body(err);
        }

        // Extract player names in order (host first)
        List<String> playerNames = room.players.stream()
            .map(p -> (String) p.get("username"))
            .toList();

        // Create and start the authoritative game session
        wsController.createAndStartSession(
            room.code,
            room.hostUsername,
            room.mode,
            room.variant,
            room.difficulty,
            playerNames
        );

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("roomCode", room.code);
        return ResponseEntity.ok(result);
    }

    /** Clean up a room. */
    @PostMapping("/rooms/{code}/close")
    public ResponseEntity<Map<String, Object>> closeRoom(@PathVariable String code) {
        rooms.remove(code.toUpperCase());
        wsController.removeSession(code.toUpperCase());
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        return ResponseEntity.ok(result);
    }
}