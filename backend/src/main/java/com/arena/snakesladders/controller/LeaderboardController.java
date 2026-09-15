package com.arena.snakesladders.controller;

import com.arena.snakesladders.dto.LeaderboardEntry;
import com.arena.snakesladders.service.LeaderboardService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/leaderboard")
public class LeaderboardController {

    private final LeaderboardService leaderboardService;

    public LeaderboardController(LeaderboardService leaderboardService) {
        this.leaderboardService = leaderboardService;
    }

    /**
     * @param by    winrate | wins | fastest  (default winrate)
     * @param limit max entries (default 10)
     * @param me    optional username to always include in results with their true global rank
     */
    @GetMapping
    public List<LeaderboardEntry> leaderboard(@RequestParam(defaultValue = "winrate") String by,
                                              @RequestParam(defaultValue = "10") int limit,
                                              @RequestParam(required = false) String me) {
        List<LeaderboardEntry> raw;
        switch (by.toLowerCase()) {
            case "wins":
                raw = leaderboardService.byTotalWins(limit);
                break;
            case "fastest":
                raw = leaderboardService.byFastestWin(limit);
                break;
            case "winrate":
            default:
                raw = leaderboardService.byWinRate(limit);
                break;
        }
        // Assign 1-based ranks to top entries.
        for (int i = 0; i < raw.size(); i++) {
            raw.get(i).setRank(i + 1);
        }

        // If "me" is provided and not already in the top list, append their entry with true global rank.
        if (me != null && !me.trim().isEmpty()) {
            boolean alreadyInTop = raw.stream().anyMatch(e -> e.getUsername().equalsIgnoreCase(me.trim()));
            if (!alreadyInTop) {
                leaderboardService.entryForPlayer(me.trim(), by).ifPresent(entry -> {
                    raw.add(entry);
                });
            }
        }

        return raw;
    }
}
