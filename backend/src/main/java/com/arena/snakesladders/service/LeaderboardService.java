package com.arena.snakesladders.service;

import com.arena.snakesladders.dto.LeaderboardEntry;
import com.arena.snakesladders.model.Player;
import com.arena.snakesladders.repository.PlayerRepository;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class LeaderboardService {

    private final PlayerRepository playerRepository;

    public LeaderboardService(PlayerRepository playerRepository) {
        this.playerRepository = playerRepository;
    }

    public List<LeaderboardEntry> byWinRate(int limit) {
        return playerRepository.findLeadersByWinRate().stream()
                .limit(limit)
                .map(p -> LeaderboardEntry.from(0, p))
                .collect(Collectors.toList());
    }

    public List<LeaderboardEntry> byTotalWins(int limit) {
        return playerRepository.findLeadersByTotalWins().stream()
                .limit(limit)
                .map(p -> LeaderboardEntry.from(0, p))
                .collect(Collectors.toList());
    }

    public List<LeaderboardEntry> byFastestWin(int limit) {
        return playerRepository.findLeadersByFastestWin().stream()
                .limit(limit)
                .map(p -> LeaderboardEntry.from(0, p))
                .collect(Collectors.toList());
    }

    /**
     * Returns a single player's leaderboard entry with their true global rank
     * for the given metric (winrate | wins | fastest).
     */
    public Optional<LeaderboardEntry> entryForPlayer(String username, String by) {
        List<Player> all;
        Comparator<Player> comparator;
        switch (by.toLowerCase()) {
            case "wins":
                all = playerRepository.findLeadersByTotalWins();
                comparator = Comparator
                        .comparingInt((Player p) -> -p.getTotalWins())
                        .thenComparingInt(Player::getTotalGames);
                break;
            case "fastest":
                all = playerRepository.findLeadersByFastestWin();
                comparator = Comparator
                        .comparingInt(p -> p.getFastestWinTurns() == null ? Integer.MAX_VALUE : p.getFastestWinTurns());
                break;
            case "winrate":
            default:
                all = playerRepository.findLeadersByWinRate();
                comparator = Comparator
                        .comparingDouble((Player p) -> -p.getWinRate())
                        .thenComparingInt((Player p) -> -p.getTotalWins());
                break;
        }
        all.sort(comparator);
        for (int i = 0; i < all.size(); i++) {
            Player p = all.get(i);
            if (p.getUsername().equalsIgnoreCase(username)) {
                LeaderboardEntry entry = LeaderboardEntry.from(i + 1, p);
                return Optional.of(entry);
            }
        }
        return Optional.empty();
    }
}
