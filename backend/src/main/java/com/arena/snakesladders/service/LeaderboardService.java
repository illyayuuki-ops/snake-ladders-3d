package com.arena.snakesladders.service;

import com.arena.snakesladders.dto.LeaderboardEntry;
import com.arena.snakesladders.model.Player;
import com.arena.snakesladders.repository.PlayerRepository;
import org.springframework.stereotype.Service;

import java.util.List;
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
}
