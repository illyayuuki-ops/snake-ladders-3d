package com.arena.snakesladders.service;

import com.arena.snakesladders.model.enums.Difficulty;

/**
 * In-memory representation of one participant in a live game session.
 * Not persisted directly; the session is snapshotted to JSON for durability.
 */
public class PlayerSeat {

    public final String name;
    public boolean ai;
    public Difficulty difficulty;
    public String color;

    /** Tile position (0 = start square, 1..size = board tiles). */
    public int position = 0;
    public boolean shield = false;
    public boolean doubleAvailable = false;
    public boolean freezeAvailable = false;
    /** Set when a DOUBLE power-up is armed for the seat's next roll. */
    public boolean pendingDouble = false;
    public int frozenTurns = 0;
    public boolean finished = false;
    public int placement = 0;
    public int personalTurns = 0;

    public PlayerSeat(String name, boolean ai, Difficulty difficulty, String color) {
        this.name = name;
        this.ai = ai;
        this.difficulty = difficulty;
        this.color = color;
    }

    public boolean canAct() {
        return !finished && frozenTurns <= 0;
    }
}
