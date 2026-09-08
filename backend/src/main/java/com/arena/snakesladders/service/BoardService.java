package com.arena.snakesladders.service;

import com.arena.snakesladders.model.Board;
import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.PowerUpType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Builds board layouts for every variant. CLASSIC and POWERUP use curated, fixed
 * layouts; CHAOS and SPEED use randomised layouts (CHAOS re-rolls every few turns).
 */
@Service
public class BoardService {

    private final java.util.Random rng = new java.util.Random();

    public int sizeFor(BoardVariant variant) {
        return (variant == BoardVariant.SPEED) ? 50 : 100;
    }

    public Board generate(BoardVariant variant) {
        switch (variant) {
            case CLASSIC:
                return classicBoard(false);
            case POWERUP:
                return classicBoard(true);
            case CHAOS:
                return randomBoard(100, 10, 10, false);
            case SPEED:
                return randomBoard(50, 9, 5, false);
            default:
                return classicBoard(false);
        }
    }

    /** Re-roll a CHAOS board (keeps the same sequence counter externally). */
    public Board regenerateChaos() {
        return randomBoard(100, 10, 10, false);
    }

    // ---------------------------------------------------------------- builders

    private Board classicBoard(boolean withPowerups) {
        Board b = new Board(100);
        // Standard ladders (bottom -> top)
        int[][] ladders = {
                {1, 38}, {4, 14}, {9, 31}, {21, 42}, {28, 84},
                {36, 44}, {51, 67}, {71, 91}, {80, 100}
        };
        // Standard snakes (head -> tail)
        int[][] snakes = {
                {16, 6}, {47, 26}, {49, 11}, {56, 53}, {62, 19},
                {64, 60}, {87, 24}, {93, 73}, {95, 75}, {98, 78}
        };
        for (int[] l : ladders) b.getLadders().put(l[0], l[1]);
        for (int[] s : snakes) b.getSnakes().put(s[0], s[1]);

        if (withPowerups) {
            Set<Integer> occupied = new HashSet<>();
            occupied.addAll(b.getLadders().keySet());
            occupied.addAll(b.getLadders().values());
            occupied.addAll(b.getSnakes().keySet());
            occupied.addAll(b.getSnakes().values());
            occupied.add(1);
            occupied.add(100);

            PowerUpType[] cycle = {PowerUpType.SHIELD, PowerUpType.DOUBLE, PowerUpType.FREEZE};
            int idx = 0;
            // Spread power-ups across the lower/mid board on free tiles.
            int[] candidates = {5, 12, 18, 25, 33, 41, 55, 63, 77, 88};
            for (int t : candidates) {
                if (!occupied.contains(t)) {
                    b.getPowerups().put(t, cycle[idx % cycle.length]);
                    idx++;
                }
            }
        }
        return b;
    }

    private Board randomBoard(int size, int ladderCount, int snakeCount, boolean withPowerups) {
        Board b = new Board(size);
        Set<Integer> occupied = new HashSet<>();
        occupied.add(1);
        occupied.add(size);

        int attempts = 0;
        while (b.getLadders().size() < ladderCount && attempts < 2000) {
            attempts++;
            int bottom = 2 + rng.nextInt(size - 2); // 2 .. size-1
            if (occupied.contains(bottom)) continue;
            int gap = 8 + rng.nextInt(Math.max(12, size / 3));
            int top = bottom + gap;
            if (top > size) top = size;           // a top of `size` is an instant winning ladder
            if (top <= bottom || occupied.contains(top)) continue;
            b.getLadders().put(bottom, top);
            occupied.add(bottom);
            occupied.add(top);
        }

        attempts = 0;
        while (b.getSnakes().size() < snakeCount && attempts < 2000) {
            attempts++;
            int head = 2 + rng.nextInt(size - 1); // 2 .. size-1
            if (occupied.contains(head)) continue;
            int gap = 8 + rng.nextInt(Math.max(12, size / 3));
            int tail = head - gap;
            if (tail < 2 || occupied.contains(tail)) continue;
            b.getSnakes().put(head, tail);
            occupied.add(head);
            occupied.add(tail);
        }

        if (withPowerups) {
            PowerUpType[] cycle = {PowerUpType.SHIELD, PowerUpType.DOUBLE, PowerUpType.FREEZE};
            int idx = 0;
            int want = 8;
            int guard = 0;
            while (b.getPowerups().size() < want && guard < 2000) {
                guard++;
                int t = 2 + rng.nextInt(size - 2);
                if (occupied.contains(t)) continue;
                b.getPowerups().put(t, cycle[idx % cycle.length]);
                occupied.add(t);
                idx++;
            }
        }
        return b;
    }

    /** Convenience used by the frontend to fetch a board preview without a session. */
    public List<Integer> ladderTops(Board b) {
        return new ArrayList<>(b.getLadders().values());
    }
}
