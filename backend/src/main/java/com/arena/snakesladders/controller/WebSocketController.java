package com.arena.snakesladders.controller;

import com.arena.snakesladders.dto.UsePowerUpRequest;
import com.arena.snakesladders.dto.WebSocketInMessage;
import com.arena.snakesladders.dto.WebSocketOutMessage;
import com.arena.snakesladders.dto.GameStateResponse;
import com.arena.snakesladders.model.enums.PowerUpType;
import com.arena.snakesladders.service.GameService;
import com.arena.snakesladders.service.GameSession;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * STOMP message handler for online, multi-device rooms. Clients send actions to
 * /app/room and receive state updates on /topic/room/{code}. On disconnect, the
 * dropped seat is auto-filled by an AI so the match continues.
 */
@Controller
public class WebSocketController {

    private final GameService gameService;
    private final SimpMessagingTemplate template;
    private final Map<String, RoomRef> sessionRefs = new ConcurrentHashMap<>();

    public WebSocketController(GameService gameService, SimpMessagingTemplate template) {
        this.gameService = gameService;
        this.template = template;
    }

    @MessageMapping("/room")
    public void handle(@Payload WebSocketInMessage msg, @Header("simpSessionId") String sessionId) {
        String code = msg.getRoomCode();
        if (code == null) {
            template.convertAndSend("/topic/room/global",
                    WebSocketOutMessage.error(null, "roomCode is required"));
            return;
        }
        try {
            GameStateResponse state = null;
            switch (msg.getType()) {
                case JOIN:
                    boolean ai = bool(msg.getPayload(), "ai");
                    state = gameService.toResponse(gameService.join(code, msg.getPlayer(), ai), msg.getPlayer());
                    sessionRefs.put(sessionId, new RoomRef(code, msg.getPlayer()));
                    break;
                case START:
                    state = gameService.toResponse(gameService.start(code, msg.getPlayer()), msg.getPlayer());
                    break;
                case ROLL:
                    state = gameService.toResponse(gameService.roll(code, msg.getPlayer()), msg.getPlayer());
                    break;
                case USE_POWERUP:
                    state = gameService.toResponse(
                            gameService.usePowerUp(code, msg.getPlayer(), parsePowerUp(msg)), msg.getPlayer());
                    break;
                case LEAVE:
                    gameService.handleDisconnect(code, msg.getPlayer());
                    sessionRefs.remove(sessionId);
                    state = gameService.toResponse(gameService.require(code), null);
                    break;
                case CHAT:
                    template.convertAndSend("/topic/room/" + code,
                            WebSocketOutMessage.info(code, msg.getPlayer() + ": " + str(msg.getPayload(), "text")));
                    break;
                default:
                    template.convertAndSend("/topic/room/" + code,
                            WebSocketOutMessage.error(code, "Unknown action " + msg.getType()));
            }
            if (state != null) {
                broadcast(code, state);
                autoPlayBots(code);
            }
        } catch (Exception e) {
            template.convertAndSend("/topic/room/" + code,
                    WebSocketOutMessage.error(code, e.getMessage() != null ? e.getMessage() : "error"));
        }
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        RoomRef ref = sessionRefs.remove(event.getSessionId());
        if (ref == null) return;
        boolean hasOtherSessions = sessionRefs.values().stream()
                .anyMatch(r -> r.room.equals(ref.room) && r.player.equals(ref.player));
        if (!hasOtherSessions) {
            try {
                gameService.handleDisconnect(ref.room, ref.player);
                broadcast(ref.room, gameService.toResponse(gameService.require(ref.room), null));
            } catch (Exception ignored) {
                // room may already be gone
            }
        }
    }

    private void broadcast(String code, GameStateResponse state) {
        template.convertAndSend("/topic/room/" + code, WebSocketOutMessage.state(code, state));
    }

    private void autoPlayBots(String code) {
        new Thread(() -> {
            try {
                GameSession s = gameService.require(code);
                int guard = 0;
                while (s.status == GameStateResponse.GameStatus.PLAYING
                        && s.current() != null
                        && s.current().ai
                        && guard++ < 20) {
                    GameStateResponse botState = gameService.toResponse(
                            gameService.roll(code, s.current().name), null);
                    broadcast(code, botState);
                    if (botState.status == GameStateResponse.GameStatus.FINISHED) break;
                    s = gameService.require(code);
                }
            } catch (Exception ignored) {
                // room may already be gone
            }
        }).start();
    }

    private UsePowerUpRequest parsePowerUp(WebSocketInMessage msg) {
        UsePowerUpRequest req = new UsePowerUpRequest();
        Map<String, Object> p = msg.getPayload();
        if (p != null) {
            Object t = p.get("type");
            if (t != null) req.setType(PowerUpType.valueOf(t.toString().toUpperCase()));
            req.setTarget(str(p, "target"));
        }
        return req;
    }

    private boolean bool(Map<String, Object> p, String k) {
        return p != null && Boolean.parseBoolean(String.valueOf(p.getOrDefault(k, false)));
    }

    private String str(Map<String, Object> p, String k) {
        return p == null ? null : p.get(k) == null ? null : String.valueOf(p.get(k));
    }

    private static class RoomRef {
        final String room;
        final String player;

        RoomRef(String room, String player) {
            this.room = room;
            this.player = player;
        }
    }
}
