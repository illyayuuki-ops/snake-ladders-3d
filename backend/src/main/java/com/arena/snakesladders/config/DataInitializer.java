package com.arena.snakesladders.config;

import com.arena.snakesladders.service.PlayerService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Seeds a few demo profiles on startup so the leaderboard is not
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
            String[][] seeds = {
                    {"Alice", "3", "1", "38"},
                    {"Bob", "2", "2", "42"},
                    {"Carol", "1", "3", "0"},
                    {"Dave", "4", "0", "35"},
                    {"Eve", "0", "4", "0"}
            };
            for (String[] s : seeds) {
                var p = playerService.createOrGet(s[0]);
                p.setTotalGames(Integer.parseInt(s[1]));
                p.setTotalWins(Integer.parseInt(s[2]));
                if (Integer.parseInt(s[3]) > 0) p.setFastestWinTurns(Integer.parseInt(s[3]));
            }
        }
    }
}
