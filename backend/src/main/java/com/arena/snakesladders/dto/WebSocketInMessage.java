package com.arena.snakesladders.dto;

import java.util.Map;

/**
 * Generic inbound WebSocket (STOMP) message.
 * type: JOIN | START | ROLL | USE_POWERUP | CHAT | LEAVE
 */
public class WebSocketInMessage {

    public enum Type { JOIN, START, ROLL, USE_POWERUP, CHAT, LEAVE }

    private Type type;
    private String roomCode;
    private String player;
    private Map<String, Object> payload; // optional extra data (e.g. power-up type/target)

    public Type getType() {
        return type;
    }

    public void setType(Type type) {
        this.type = type;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public void setRoomCode(String roomCode) {
        this.roomCode = roomCode;
    }

    public String getPlayer() {
        return player;
    }

    public void setPlayer(String player) {
        this.player = player;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }
}
