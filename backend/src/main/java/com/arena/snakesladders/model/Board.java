package com.arena.snakesladders.model;

import com.arena.snakesladders.model.enums.PowerUpType;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Non-persistent board layout: snakes (head->tail), ladders (bottom->top) and
 * power-up tiles. {@code sequence} bumps each time the CHAOS variant reshuffles.
 */
public class Board {

    private final int size;
    private final Map<Integer, Integer> snakes = new LinkedHashMap<>();
    private final Map<Integer, Integer> ladders = new LinkedHashMap<>();
    private final Map<Integer, PowerUpType> powerups = new LinkedHashMap<>();
    private int sequence = 0;

    public Board(int size) {
        this.size = size;
    }

    public int getSize() {
        return size;
    }

    public Map<Integer, Integer> getSnakes() {
        return snakes;
    }

    public Map<Integer, Integer> getLadders() {
        return ladders;
    }

    public Map<Integer, PowerUpType> getPowerups() {
        return powerups;
    }

    public int getSequence() {
        return sequence;
    }

    public void setSequence(int sequence) {
        this.sequence = sequence;
    }

    public Integer ladderFrom(int tile) {
        return ladders.get(tile);
    }

    public Integer snakeFrom(int tile) {
        return snakes.get(tile);
    }

    public PowerUpType powerUpAt(int tile) {
        return powerups.get(tile);
    }
}
