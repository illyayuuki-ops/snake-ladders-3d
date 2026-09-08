package com.arena.snakesladders.dto;

import com.arena.snakesladders.model.enums.PowerUpType;

import javax.validation.constraints.NotNull;

public class UsePowerUpRequest {

    @NotNull
    private PowerUpType type;

    /** Target player name (required for FREEZE). */
    private String target;

    public PowerUpType getType() {
        return type;
    }

    public void setType(PowerUpType type) {
        this.type = type;
    }

    public String getTarget() {
        return target;
    }

    public void setTarget(String target) {
        this.target = target;
    }
}
