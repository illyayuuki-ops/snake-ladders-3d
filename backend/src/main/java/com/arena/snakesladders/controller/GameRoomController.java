package com.arena.snakesladders.controller;

import org.springframework.messaging.handler.annotation.*;
import org.springframework.stereotype.Controller;

/**
 * WebSocket controller for real-time game state broadcasting.
 * Clients subscribe to /topic/room.{code} and receive state updates.
 * The host sends state via /app/room.{code}.state and the broker
 * relays it to all subscribers of that room.
 */
@Controller
public class GameRoomController {

    /** Receive a game state broadcast for a room and relay to all subscribers. */
    @MessageMapping("/room.{code}.state")
    @SendTo("/topic/room.{code}")
    public Object broadcastState(@DestinationVariable String code, Object state) {
        // The simple broker relays this to all subscribers of /topic/room.{code}
        return state;
    }
}
