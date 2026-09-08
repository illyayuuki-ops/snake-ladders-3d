package com.arena.snakesladders.service;

import com.arena.snakesladders.dto.CreatePlayerRequest;
import com.arena.snakesladders.dto.UpdatePlayerRequest;
import com.arena.snakesladders.model.GameHistory;
import com.arena.snakesladders.model.Player;
import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.GameMode;
import com.arena.snakesladders.repository.GameHistoryRepository;
import com.arena.snakesladders.repository.PlayerRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.persistence.EntityNotFoundException;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class PlayerService {

    private final PlayerRepository playerRepository;
    private final GameHistoryRepository gameHistoryRepository;

    @Autowired
    public PlayerService(PlayerRepository playerRepository, GameHistoryRepository gameHistoryRepository) {
        this.playerRepository = playerRepository;
        this.gameHistoryRepository = gameHistoryRepository;
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

    /** Find an existing profile or create one on the fly (used when a match ends). */
    public Player createOrGet(String username) {
        return playerRepository.findByUsernameIgnoreCase(username)
                .orElseGet(() -> playerRepository.save(new Player(username.trim())));
    }

    /** Apply a finished match to a player's aggregate stats and history. */
    public void recordMatch(Player player, GameMode mode, BoardVariant variant,
                            boolean won, int turns, int placement) {
        playerRepository.incrementStats(player.getId(), won, turns);
        GameHistory h = new GameHistory(player, mode, variant, won, turns, placement);
        gameHistoryRepository.save(h);
    }
}
