package com.arena.snakesladders.dto;

/**
 * Generic outbound WebSocket (STOMP) message.
 * type: STATE | EVENT | ERROR | INFO
 */
public class WebSocketOutMessage {

    public enum Type { STATE, EVENT, ERROR, INFO }

    private Type type;
    private String roomCode;
    private GameStateResponse state;
    private String message;

    public static WebSocketOutMessage state(String roomCode, GameStateResponse state) {
        WebSocketOutMessage m = new WebSocketOutMessage();
        m.type = Type.STATE;
        m.roomCode = roomCode;
        m.state = state;
        return m;
    }

    public static WebSocketOutMessage error(String roomCode, String message) {
        WebSocketOutMessage m = new WebSocketOutMessage();
        m.type = Type.ERROR;
        m.roomCode = roomCode;
        m.message = message;
        return m;
    }

    public static WebSocketOutMessage info(String roomCode, String message) {
        WebSocketOutMessage m = new WebSocketOutMessage();
        m.type = Type.INFO;
        m.roomCode = roomCode;
        m.message = message;
        return m;
    }

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

    public GameStateResponse getState() {
        return state;
    }

    public void setState(GameStateResponse state) {
        this.state = state;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
