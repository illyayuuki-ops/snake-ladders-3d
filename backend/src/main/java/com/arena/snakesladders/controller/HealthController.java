package com.arena.snakesladders.controller;

import com.arena.snakesladders.service.GameService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    private final GameService gameService;

    public HealthController(GameService gameService) {
        this.gameService = gameService;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "UP");
        m.put("activeGames", gameService.activeSummaries().size());
        m.put("time", System.currentTimeMillis());
        return m;
    }
}
