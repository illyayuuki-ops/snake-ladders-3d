package com.arena.snakesladders.repository;

import com.arena.snakesladders.model.Player;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlayerRepository extends JpaRepository<Player, Long> {

    Optional<Player> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    /** Top players ordered by win rate, then total wins. */
    @Query("SELECT p FROM Player p WHERE p.totalGames > 0 " +
           "ORDER BY (CAST(p.totalWins AS double) / p.totalGames) DESC, p.totalWins DESC")
    List<Player> findLeadersByWinRate();

    /** Top players ordered by total wins. */
    @Query("SELECT p FROM Player p ORDER BY p.totalWins DESC, p.totalGames ASC")
    List<Player> findLeadersByTotalWins();

    /** Top players ordered by fewest turns taken to win. */
    @Query("SELECT p FROM Player p WHERE p.fastestWinTurns IS NOT NULL " +
           "ORDER BY p.fastestWinTurns ASC")
    List<Player> findLeadersByFastestWin();

    @Modifying
    @Query(value = "UPDATE players SET total_games = total_games + 1, total_wins = total_wins + CASE WHEN :won THEN 1 ELSE 0 END, fastest_win_turns = CASE WHEN fastest_win_turns IS NULL OR (:won AND :turns < fastest_win_turns) THEN :turns ELSE fastest_win_turns END WHERE id = :id", nativeQuery = true)
    int incrementStats(@Param("id") Long id, @Param("won") boolean won, @Param("turns") int turns);
}
