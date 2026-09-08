package com.arena.snakesladders.model.enums;

/**
 * How the match is played.
 */
public enum GameMode {
    /** 1 human vs 1-3 AI bots. */
    VS_AI,
    /** 2, 3 or 4 human players sharing one screen (local). */
    LOCAL,
    /** Human players on different devices joined via a room code. */
    ONLINE
}
