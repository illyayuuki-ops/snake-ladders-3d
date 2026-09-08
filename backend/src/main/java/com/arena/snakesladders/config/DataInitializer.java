package com.arena.snakesladders.config;

import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.GameMode;
import com.arena.snakesladders.service.PlayerService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Seeds a few demo profiles + match history on startup so the leaderboard is not
 * empty on first run. Harmless on every boot (profiles are upserted by username).
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private final PlayerService playerService;

    public DataInitializer(PlayerService playerService) {
        this.playerService = playerService;
    }

    @Override
    public void run(String... args) {
        if (playerService.findAll().isEmpty()) {
            String[] names = {"Alice", "Bob", "Carol", "Dave", "Eve"};
            int[][] results = {
                    {1, 0, 42}, {1, 1, 38}, {0, 1, 0}, {1, 0, 51}, {0, 1, 0}
            };
            for (int i = 0; i < names.length; i++) {
                var p = playerService.createOrGet(names[i]);
                int wins = results[i][0];
                int losses = results[i][1];
                int fastest = results[i][2];
                for (int w = 0; w < wins; w++) {
                    playerService.recordMatch(p, GameMode.LOCAL, BoardVariant.CLASSIC, true,
                            fastest + (w == 0 ? 0 : 5), 1);
                }
                for (int l = 0; l < losses; l++) {
                    playerService.recordMatch(p, GameMode.VS_AI, BoardVariant.POWERUP, false, 60, 2);
                }
            }
        }
    }
}
