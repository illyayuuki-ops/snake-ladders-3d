package com.arena.snakesladders.service;

import com.arena.snakesladders.model.enums.Difficulty;
import org.springframework.stereotype.Service;

import java.util.Random;

/**
 * Decision logic for AI bots. EASY bots act randomly; SMART bots use power-ups
 * tactically (freeze the leader, double-roll when close to winning or behind).
 */
@Service
public class BotService {

    private final Random rng = new Random();

    /** Whether a bot should spend its FREEZE charge now. */
    public boolean shouldUseFreeze(GameSession session, PlayerSeat seat) {
        PlayerSeat leader = currentLeader(session, seat);
        if (leader == null) return false;
        if (seat.difficulty == Difficulty.EASY) {
            return rng.nextDouble() < 0.35;
        }
        // SMART: freeze the leader if meaningfully ahead of us.
        return (leader.position - seat.position) >= 3;
    }

    /** Whether a bot should spend its DOUBLE-ROLL charge now. */
    public boolean shouldUseDouble(GameSession session, PlayerSeat seat) {
        int size = session.board.getSize();
        if (seat.difficulty == Difficulty.EASY) {
            return rng.nextDouble() < 0.35;
        }
        // SMART: double when within striking distance of the win or trailing the leader.
        boolean nearWin = (size - seat.position) <= 12;
        PlayerSeat leader = currentLeader(session, seat);
        boolean behind = leader != null && (leader.position - seat.position) >= 4;
        return nearWin || behind;
    }

    /** The current front-runner who is not the given seat. */
    public PlayerSeat currentLeader(GameSession session, PlayerSeat self) {
        PlayerSeat best = null;
        for (PlayerSeat s : session.seats) {
            if (s == self || s.finished) continue;
            if (best == null || s.position > best.position) best = s;
        }
        return best;
    }

    public int rollDie() {
        return 1 + rng.nextInt(6);
    }
}
