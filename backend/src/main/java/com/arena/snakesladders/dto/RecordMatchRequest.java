package com.arena.snakesladders.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Positive;

public class RecordMatchRequest {
    @NotBlank
    private String username;

    @NotBlank
    private String mode;

    @NotBlank
    private String variant;

    private boolean won;

    @Positive
    private int turns;

    @Positive
    private int placement;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getVariant() {
        return variant;
    }

    public void setVariant(String variant) {
        this.variant = variant;
    }

    public boolean isWon() {
        return won;
    }

    public void setWon(boolean won) {
        this.won = won;
    }

    public int getTurns() {
        return turns;
    }

    public void setTurns(int turns) {
        this.turns = turns;
    }

    public int getPlacement() {
        return placement;
    }

    public void setPlacement(int placement) {
        this.placement = placement;
    }
}
