package com.arena.snakesladders.service;

import com.arena.snakesladders.dto.CreatePlayerRequest;
import com.arena.snakesladders.dto.UpdatePlayerRequest;
import com.arena.snakesladders.model.GameHistory;
import com.arena.snakesladders.model.Player;
import com.arena.snakesladders.repository.GameHistoryRepository;
import com.arena.snakesladders.repository.PlayerRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.persistence.EntityNotFoundException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class PlayerService {

    private final PlayerRepository playerRepository;
    private final GameHistoryRepository historyRepository;

    @Autowired
    public PlayerService(PlayerRepository playerRepository, GameHistoryRepository historyRepository) {
        this.playerRepository = playerRepository;
        this.historyRepository = historyRepository;
    }

    public List<Player> findAll() {
        return playerRepository.findAll();
    }

    public Optional<Player> findById(Long id) {
        return playerRepository.findById(id);
    }

    public Optional<Player> findByUsername(String username) {
        return playerRepository.findByUsernameIgnoreCase(username);
    }

    public boolean exists(String username) {
        return playerRepository.existsByUsernameIgnoreCase(username);
    }

    public Player create(CreatePlayerRequest req) {
        if (playerRepository.existsByUsernameIgnoreCase(req.getUsername())) {
            throw new IllegalArgumentException("Username '" + req.getUsername() + "' is already taken.");
        }
        Player p = new Player(req.getUsername().trim());
        return playerRepository.save(p);
    }

    public Player update(Long id, UpdatePlayerRequest req) {
        Player p = playerRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Player not found: " + id));
        if (!p.getUsername().equalsIgnoreCase(req.getUsername())
                && playerRepository.existsByUsernameIgnoreCase(req.getUsername())) {
            throw new IllegalArgumentException("Username '" + req.getUsername() + "' is already taken.");
        }
        p.setUsername(req.getUsername().trim());
        return playerRepository.save(p);
    }

    public void delete(Long id) {
        if (!playerRepository.existsById(id)) {
            throw new EntityNotFoundException("Player not found: " + id);
        }
        playerRepository.deleteById(id);
    }

    /** Find an existing profile or create one on the fly. */
    public Player createOrGet(String username) {
        return playerRepository.findByUsernameIgnoreCase(username)
                .orElseGet(() -> playerRepository.save(new Player(username.trim())));
    }

    /** Search players by substring (case-insensitive), capped at limit. If query is blank, return first N players. */
    public List<Player> search(String query, int limit) {
        if (query == null || query.trim().isEmpty()) {
            return playerRepository.findAll().stream().limit(limit).collect(Collectors.toList());
        }
        List<Player> results = playerRepository.findByUsernameContainingIgnoreCase(query.trim());
        if (results.size() > limit) {
            return results.subList(0, limit);
        }
        return results;
    }

    /** Record a finished match result for a player. */
    public void recordMatch(String username, String mode, String variant, boolean won, int turns, int placement) {
        Player p = createOrGet(username);
        playerRepository.incrementStats(p.getId(), won, turns);

        // Persist detailed game history
        GameHistory gh = new GameHistory(username, mode, variant, won, turns, placement, LocalDateTime.now());
        historyRepository.save(gh);
    }

    /** Record a finished match result for a player with a specific playedAt timestamp (for seeding). */
    public void recordMatchWithTimestamp(String username, String mode, String variant, boolean won, int turns, int placement, LocalDateTime playedAt) {
        Player p = createOrGet(username);
        playerRepository.incrementStats(p.getId(), won, turns);

        // Persist detailed game history with custom timestamp
        GameHistory gh = new GameHistory(username, mode, variant, won, turns, placement, playedAt);
        historyRepository.save(gh);
    }
}
