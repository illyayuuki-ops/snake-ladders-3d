package com.arena.snakesladders.model.enums;

/**
 * Board layouts / rule variants.
 */
public enum BoardVariant {
    /** Standard 100-tile board. */
    CLASSIC,
    /** 100-tile board with collectible power-up tiles. */
    POWERUP,
    /** 100-tile board that reshuffles snakes/ladders every 3 turns. */
    CHAOS,
    /** Fast 50-tile board with a higher ladder density. */
    SPEED
}
