package com.arena.snakesladders.controller;

import com.arena.snakesladders.dto.CreateGameRequest;
import com.arena.snakesladders.dto.GameStateResponse;
import com.arena.snakesladders.dto.UsePowerUpRequest;
import com.arena.snakesladders.service.GameService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/games")
public class GameController {

    private final GameService gameService;

    public GameController(GameService gameService) {
        this.gameService = gameService;
    }

    @PostMapping
    public GameStateResponse create(@Valid @RequestBody CreateGameRequest req) {
        return gameService.toResponse(gameService.createSession(req), req.getHostUsername());
    }

    @GetMapping
    public List<GameStateResponse> active() {
        return gameService.activeSummaries();
    }

    @GetMapping("/{code}")
    public GameStateResponse get(@PathVariable String code) {
        return gameService.toResponse(gameService.require(code), null);
    }

    @PostMapping("/{code}/join")
    public GameStateResponse join(@PathVariable String code,
                                  @RequestParam String name,
                                  @RequestParam(defaultValue = "false") boolean ai) {
        return gameService.toResponse(gameService.join(code, name, ai),
                name);
    }

    @PostMapping("/{code}/start")
    public GameStateResponse start(@PathVariable String code, @RequestParam(required = false) String player) {
        return gameService.toResponse(gameService.start(code, player), player);
    }

    @PostMapping("/{code}/roll")
    public GameStateResponse roll(@PathVariable String code, @RequestParam String player) {
        return gameService.toResponse(gameService.roll(code, player), player);
    }

    @PostMapping("/{code}/powerup")
    public GameStateResponse powerup(@PathVariable String code,
                                     @RequestParam String player,
                                     @Valid @RequestBody UsePowerUpRequest req) {
        return gameService.toResponse(gameService.usePowerUp(code, player, req), player);
    }

    @PostMapping("/{code}/leave")
    public ResponseEntity<Void> leave(@PathVariable String code, @RequestParam String player) {
        gameService.handleDisconnect(code, player);
        return ResponseEntity.ok().build();
    }
}
