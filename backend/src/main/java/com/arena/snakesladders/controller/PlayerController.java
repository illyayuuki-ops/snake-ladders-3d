package com.arena.snakesladders.controller;

import com.arena.snakesladders.dto.CreatePlayerRequest;
import com.arena.snakesladders.dto.PlayerResponse;
import com.arena.snakesladders.dto.UpdatePlayerRequest;
import com.arena.snakesladders.model.Player;
import com.arena.snakesladders.service.PlayerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/players")
public class PlayerController {

    private final PlayerService playerService;

    public PlayerController(PlayerService playerService) {
        this.playerService = playerService;
    }

    @GetMapping
    public List<PlayerResponse> list() {
        return playerService.findAll().stream()
                .map(PlayerResponse::from)
                .collect(Collectors.toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PlayerResponse> get(@PathVariable Long id) {
        return playerService.findById(id)
                .map(p -> ResponseEntity.ok(PlayerResponse.from(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/username/{username}")
    public ResponseEntity<PlayerResponse> getByUsername(@PathVariable String username) {
        return playerService.findByUsername(username)
                .map(p -> ResponseEntity.ok(PlayerResponse.from(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    /** Create a profile, or return the existing one if the name is taken. */
    @PostMapping
    public PlayerResponse create(@Valid @RequestBody CreatePlayerRequest req) {
        if (playerService.exists(req.getUsername())) {
            return playerService.findByUsername(req.getUsername())
                    .map(PlayerResponse::from)
                    .orElseThrow();
        }
        return PlayerResponse.from(playerService.create(req));
    }

    /** Idempotent lookup/create used by the frontend to register a local profile. */
    @PostMapping("/ensure")
    public PlayerResponse ensure(@Valid @RequestBody CreatePlayerRequest req) {
        Player p = playerService.createOrGet(req.getUsername());
        return PlayerResponse.from(p);
    }

    @PutMapping("/{id}")
    public PlayerResponse update(@PathVariable Long id, @Valid @RequestBody UpdatePlayerRequest req) {
        return PlayerResponse.from(playerService.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        playerService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
