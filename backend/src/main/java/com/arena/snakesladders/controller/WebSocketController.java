package com.arena.snakesladders.controller;

import com.arena.snakesladders.dto.GameStateResponse;
import com.arena.snakesladders.dto.WebSocketInMessage;
import com.arena.snakesladders.dto.WebSocketOutMessage;
import com.arena.snakesladders.service.GameService;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class WebSocketController {

    private final GameService gameService;
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketController(GameService gameService, SimpMessagingTemplate messagingTemplate) {
        this.gameService = gameService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/room")
    public void handleRoomAction(WebSocketInMessage message) {
        if (message == null || message.getRoomCode() == null || message.getType() == null) {
            return;
        }

        String roomCode = message.getRoomCode().trim().toUpperCase();
        try {
            GameStateResponse state;
            switch (message.getType()) {
                case JOIN:
                    state = gameService.join(roomCode, message.getPlayer(), message.getPayload());
                    break;
                case START:
                    state = gameService.start(roomCode, message.getPlayer());
                    break;
                case ROLL:
                    state = gameService.roll(roomCode, message.getPlayer());
                    break;
                case USE_POWERUP:
                    state = gameService.usePowerUp(roomCode, message.getPlayer(), message.getPayload());
                    break;
                case LEAVE:
                    state = gameService.leave(roomCode, message.getPlayer());
                    break;
                case CHAT:
                    state = gameService.chat(roomCode, message.getPlayer(), message.getPayload());
                    break;
                default:
                    throw new IllegalArgumentException("Unsupported room action: " + message.getType());
            }
            broadcastState(roomCode, state);
        } catch (RuntimeException e) {
            messagingTemplate.convertAndSend("/topic/room/" + roomCode,
                WebSocketOutMessage.error(roomCode, e.getMessage()));
        }
    }

    private void broadcastState(String roomCode, GameStateResponse state) {
        messagingTemplate.convertAndSend("/topic/room/" + roomCode,
            WebSocketOutMessage.state(roomCode, state));
    }
}
