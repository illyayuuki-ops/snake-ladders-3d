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

    /** Total number of registered players. */
    public long count() {
        return playerRepository.count();
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

    /**
     * Find an existing profile or create one with a specific createdAt timestamp.
     * Used by the backdated demo seeding so created_at matches the target date.
     * Because createdAt is updatable=false, this MUST be called before the
     * first insert of the entity.
     */
    public Player createOrGetWithCreatedAt(String username, LocalDateTime createdAt) {
        return playerRepository.findByUsernameIgnoreCase(username)
                .orElseGet(() -> {
                    Player p = new Player(username.trim());
                    p.setCreatedAt(createdAt);
                    return playerRepository.save(p);
                });
    }

    /** Delete a player and all their game history by username (case-insensitive). */
    public void deleteByUsername(String username) {
        playerRepository.findByUsernameIgnoreCase(username).ifPresent(p -> {
            playerRepository.delete(p);
            historyRepository.deleteByUsernameIgnoreCase(username);
        });
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

    /**
     * Record a finished match result for a player with a specific playedAt timestamp (for seeding).
     * If the player does not yet exist, creates them with createdAt = playedAt so the
     * updatable=false column is set correctly on first insert.
     */
    public void recordMatchWithTimestamp(String username, String mode, String variant, boolean won, int turns, int placement, LocalDateTime playedAt) {
        Player p = createOrGetWithCreatedAt(username, playedAt);
        playerRepository.incrementStats(p.getId(), won, turns);

        // Persist detailed game history with custom timestamp
        GameHistory gh = new GameHistory(username, mode, variant, won, turns, placement, playedAt);
        historyRepository.save(gh);
    }
}
