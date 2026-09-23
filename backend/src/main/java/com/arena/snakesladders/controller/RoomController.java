package com.arena.snakesladders.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simple in-memory room management for online multiplayer.
 * Rooms are created via REST and game state is synced via WebSocket.
 */
@RestController
@RequestMapping("/api")
public class RoomController {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    static class Room {
        String code;
        String hostUsername;
        List<Map<String, Object>> players = new ArrayList<>();
        List<Object> stateLog = new ArrayList<>();
        long createdAt;
    }

    /** Create a new room and return the room code. */
    @PostMapping("/rooms")
    public ResponseEntity<Map<String, Object>> createRoom(@RequestBody Map<String, String> body) {
        String username = body.getOrDefault("username", "Player");

        // Generate a unique 6-digit room code
        String code;
        do {
            code = String.valueOf(100000 + new Random().nextInt(900000));
        } while (rooms.containsKey(code));

        Room room = new Room();
        room.code = code;
        room.hostUsername = username;
        room.createdAt = System.currentTimeMillis();

        Map<String, Object> player = new HashMap<>();
        player.put("username", username);
        player.put("host", true);
        room.players.add(player);

        rooms.put(code, room);

        Map<String, Object> result = new HashMap<>();
        result.put("roomCode", code);
        result.put("hostUsername", username);
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
        result.put("playerCount", room.players.size());
        result.put("ageSeconds", (System.currentTimeMillis() - room.createdAt) / 1000);
        return ResponseEntity.ok(result);
    }

    /** Clean up a room. */
    @PostMapping("/rooms/{code}/close")
    public ResponseEntity<Map<String, Object>> closeRoom(@PathVariable String code) {
        rooms.remove(code.toUpperCase());
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        return ResponseEntity.ok(result);
    }
}
