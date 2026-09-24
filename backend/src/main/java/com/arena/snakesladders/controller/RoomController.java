package com.arena.snakesladders.controller;

import com.arena.snakesladders.service.GameService;
import com.arena.snakesladders.service.GameService.RoomInfo;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class RoomController {

    private final GameService gameService;

    public RoomController(GameService gameService) {
        this.gameService = gameService;
    }

    @PostMapping("/rooms")
    public ResponseEntity<Map<String, Object>> createRoom(@RequestBody Map<String, String> body) {
        Map<String, String> request = body == null ? new HashMap<>() : body;
        RoomInfo room = gameService.createRoom(
            request.get("username"),
            request.get("mode"),
            request.get("variant"),
            request.get("difficulty")
        );
        return ResponseEntity.ok(toRoomResponse(room));
    }

    @PostMapping("/rooms/join")
    public ResponseEntity<Map<String, Object>> joinRoom(@RequestBody Map<String, String> body) {
        Map<String, String> request = body == null ? new HashMap<>() : body;
        RoomInfo room = gameService.joinRoom(request.get("code"), request.get("username"));
        return ResponseEntity.ok(toRoomResponse(room));
    }

    @GetMapping("/rooms/{code}")
    public ResponseEntity<Map<String, Object>> getRoom(@PathVariable String code) {
        return ResponseEntity.ok(toRoomResponse(gameService.getRoom(code)));
    }

    @PostMapping("/rooms/{code}/close")
    public ResponseEntity<Map<String, Object>> closeRoom(@PathVariable String code) {
        gameService.closeRoom(code);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        return ResponseEntity.ok(result);
    }

    private Map<String, Object> toRoomResponse(RoomInfo room) {
        Map<String, Object> result = new HashMap<>();
        result.put("roomCode", room.getRoomCode());
        result.put("hostUsername", room.getHostUsername());
        result.put("mode", room.getMode().name());
        result.put("variant", room.getVariant().name());
        result.put("difficulty", room.getDifficulty().name());
        result.put("playerCount", room.getPlayers().size());
        result.put("players", room.getPlayers());
        result.put("ageSeconds", Math.max(0, (room.getNow() - room.getCreatedAt()) / 1000));
        return result;
    }
}
