package com.arena.snakesladders.controller;

import com.arena.snakesladders.dto.GameStateResponse;
import com.arena.snakesladders.dto.WebSocketInMessage;
import com.arena.snakesladders.dto.WebSocketOutMessage;
import com.arena.snakesladders.model.Board;
import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;
import com.arena.snakesladders.model.enums.PowerUpType;
import com.arena.snakesladders.service.BoardService;
import com.arena.snakesladders.service.GameSession;
import com.arena.snakesladders.service.PlayerSeat;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-authoritative WebSocket controller for online multiplayer.
 * Single STOMP contract: clients send to /app/room, server broadcasts to /topic/room/{code}.
 * All game logic runs on the backend via GameSession; clients are thin viewers.
 */
@Controller
public class WebSocketController {

    private final BoardService boardService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<String, GameSession> sessions = new ConcurrentHashMap<>();

    public WebSocketController(BoardService boardService, SimpMessagingTemplate messagingTemplate) {
        this.boardService = boardService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Handle inbound actions from any client (host or joiner).
     * Delegates to the authoritative GameSession, then broadcasts resulting state.
     */
    @MessageMapping("/room")
    public void handleRoomAction(WebSocketInMessage message) {
        if (message == null || message.getRoomCode() == null || message.getType() == null) {
            return;
        }

        String roomCode = message.getRoomCode().toUpperCase();
        GameSession session = sessions.get(roomCode);

        // Lazy-create session on first JOIN if room exists via REST
        if (session == null && message.getType() == WebSocketInMessage.Type.JOIN) {
            // Session will be created when host starts the game via START
            // For now, we just acknowledge the join; actual session creation happens on START
        }

        if (session == null) {
            // Room not started yet; send error to sender (best effort)
            messagingTemplate.convertAndSend("/topic/room/" + roomCode,
                WebSocketOutMessage.error(roomCode, "Room not started"));
            return;
        }

        synchronized (session.lock) {
            GameStateResponse newState = switch (message.getType()) {
                case JOIN -> handleJoin(session, message);
                case START -> handleStart(session, message);
                case ROLL -> handleRoll(session, message);
                case USE_POWERUP -> handleUsePowerUp(session, message);
                case LEAVE -> handleLeave(session, message);
                case CHAT -> handleChat(session, message);
            };

            if (newState != null) {
                broadcastState(roomCode, newState);
            }
        }
    }

    private GameStateResponse handleJoin(GameSession session, WebSocketInMessage msg) {
        String playerName = msg.getPlayer();
        if (playerName == null || session.seatByName(playerName) != null) {
            return session.snapshotFor(null); // no-op if already exists
        }

        // Add new player seat
        int colorIdx = session.seats.size() % PlayerSeat.COLORS.length;
        PlayerSeat seat = new PlayerSeat(playerName, false, session.difficulty, PlayerSeat.COLORS[colorIdx]);
        session.seats.add(seat);
        session.log.add(playerName + " joined the game.");

        return session.snapshotFor(playerName);
    }

    private GameStateResponse handleStart(GameSession session, WebSocketInMessage msg) {
        if (session.status != GameStateResponse.GameStatus.WAITING) {
            return session.snapshotFor(msg.getPlayer()); // already started
        }

        session.status = GameStateResponse.GameStatus.PLAYING;
        session.log.add("Game started!");
        session.boardSequence++;
        session.boardChanged = true;

        return session.snapshotFor(msg.getPlayer());
    }

    private GameStateResponse handleRoll(GameSession session, WebSocketInMessage msg) {
        String playerName = msg.getPlayer();
        if (playerName == null) return session.snapshotFor(null);

        PlayerSeat seat = session.seatByName(playerName);
        if (seat == null) return session.snapshotFor(null);

        // Validate turn
        if (session.current() != seat) {
            return session.snapshotFor(playerName); // not your turn
        }

        if (!seat.canAct()) {
            // Frozen - skip turn
            if (seat.frozenTurns > 0) {
                seat.frozenTurns--;
                session.log.add(seat.name + " is frozen and skips.");
            }
            session.lastEvent = null;
            session.advanceTurn();
            return session.snapshotFor(playerName);
        }

        // Process the turn
        processTurn(session, seat);

        if (session.status == GameStateResponse.GameStatus.PLAYING) {
            session.advanceTurn();
        }

        return session.snapshotFor(playerName);
    }

    private void processTurn(GameSession session, PlayerSeat seat) {
        int size = session.board.getSize();
        int roll = seat.pendingDouble ? (rollDie() + rollDie()) : rollDie();
        seat.pendingDouble = false;
        session.dice = roll;
        seat.personalTurns++;
        session.turnCount++;

        int from = seat.position;
        int raw = from + roll;
        int to;
        boolean bounced = false;

        if (raw > size) {
            to = 2 * size - raw;
            bounced = true;
        } else {
            to = raw;
        }

        GameStateResponse.MoveEvent.MoveKind kind;
        List<Integer> path;

        if (session.board.getLadders().containsKey(to)) {
            int pre = to;
            to = session.board.getLadders().get(to);
            kind = GameStateResponse.MoveEvent.MoveKind.CLIMB;
            path = buildPath(from, pre);
        } else if (session.board.getSnakes().containsKey(to)) {
            if (seat.shield) {
                seat.shield = false;
                kind = GameStateResponse.MoveEvent.MoveKind.SHIELD;
                path = buildPath(from, to);
                session.log.add(seat.name + " blocked a snake with SHIELD!");
            } else {
                int pre = to;
                to = session.board.getSnakes().get(to);
                kind = GameStateResponse.MoveEvent.MoveKind.SLIDE;
                path = buildPath(from, pre);
            }
        } else {
            kind = bounced ? GameStateResponse.MoveEvent.MoveKind.BOUNCE : GameStateResponse.MoveEvent.MoveKind.MOVE;
            path = buildPath(from, to);
        }

        seat.position = to;

        // Check for power-up pickup
        PowerUpType pu = session.board.getPowerups().get(to);
        String puName = null;
        if (pu != null && !seat.finished) {
            puName = pu.name();
            switch (pu) {
                case SHIELD -> seat.shield = true;
                case DOUBLE -> seat.doubleAvailable = true;
                case FREEZE -> seat.freezeAvailable = true;
            }
            session.log.add(seat.name + " picked up " + puName + "!");
        }

        // Check for win
        if (to == size) {
            seat.finished = true;
            session.finishedCount++;
            seat.placement = session.finishedCount;
            if (session.winner == null) session.winner = seat.name;
            if (session.finishedCount >= session.seats.size()) {
                session.status = GameStateResponse.GameStatus.FINISHED;
            }
        } else if (session.variant == BoardVariant.CHAOS && session.turnCount % 3 == 0) {
            session.board = boardService.regenerateChaos();
            session.boardSequence++;
            session.boardChanged = true;
            session.log.add("CHAOS! The board reshuffled.");
        }

        // Build last event
        GameStateResponse.MoveEvent ev = new GameStateResponse.MoveEvent();
        ev.kind = kind;
        ev.player = seat.name;
        ev.from = from;
        ev.to = to;
        ev.path = path;
        ev.powerUp = pu;
        ev.message = buildMessage(kind, seat.name, from, to, roll, puName);
        session.lastEvent = ev;
        session.log.add(ev.message);
    }

    private GameStateResponse handleUsePowerUp(GameSession session, WebSocketInMessage msg) {
        String playerName = msg.getPlayer();
        if (playerName == null) return session.snapshotFor(null);

        PlayerSeat seat = session.seatByName(playerName);
        if (seat == null || session.current() != seat || session.status != GameStateResponse.GameStatus.PLAYING) {
            return session.snapshotFor(playerName);
        }

        Map<String, Object> payload = msg.getPayload();
        if (payload == null) return session.snapshotFor(playerName);

        String typeStr = (String) payload.get("type");
        String targetName = (String) payload.get("target");

        if (typeStr == null) return session.snapshotFor(playerName);

        try {
            PowerUpType type = PowerUpType.valueOf(typeStr.toUpperCase());
            switch (type) {
                case SHIELD -> {
                    seat.shield = true;
                    session.log.add(seat.name + " activated SHIELD!");
                }
                case DOUBLE -> {
                    if (!seat.doubleAvailable) return session.snapshotFor(playerName);
                    seat.pendingDouble = true;
                    seat.doubleAvailable = false;
                    session.log.add(seat.name + " armed DOUBLE ROLL!");
                }
                case FREEZE -> {
                    if (!seat.freezeAvailable) return session.snapshotFor(playerName);
                    PlayerSeat target = targetName != null ? session.seatByName(targetName) : findLeader(session, seat);
                    if (target == null || target == seat) return session.snapshotFor(playerName);
                    target.frozenTurns++;
                    seat.freezeAvailable = false;
                    session.log.add(seat.name + " froze " + target.name + "!");
                }
            }
        } catch (IllegalArgumentException e) {
            // Invalid power-up type
        }

        return session.snapshotFor(playerName);
    }

    private GameStateResponse handleLeave(GameSession session, WebSocketInMessage msg) {
        String playerName = msg.getPlayer();
        if (playerName == null) return session.snapshotFor(null);

        PlayerSeat seat = session.seatByName(playerName);
        if (seat != null) {
            seat.finished = true;
            session.log.add(playerName + " left the game.");
        }
        return session.snapshotFor(playerName);
    }

    private GameStateResponse handleChat(GameSession session, WebSocketInMessage msg) {
        // Chat messages are broadcast as INFO type
        String playerName = msg.getPlayer();
        Map<String, Object> payload = msg.getPayload();
        String text = payload != null ? (String) payload.get("text") : null;
        if (text != null && !text.isBlank()) {
            session.log.add(playerName + ": " + text);
            messagingTemplate.convertAndSend("/topic/room/" + session.roomCode,
                WebSocketOutMessage.info(session.roomCode, playerName + ": " + text));
        }
        return null; // Don't broadcast full state for chat
    }

    private void broadcastState(String roomCode, GameStateResponse state) {
        messagingTemplate.convertAndSend("/topic/room/" + roomCode, WebSocketOutMessage.state(roomCode, state));
    }

    // ==================== Helpers ====================

    private int rollDie() {
        return 1 + (int) (Math.random() * 6);
    }

    private List<Integer> buildPath(int from, int to) {
        List<Integer> path = new ArrayList<>();
        if (to >= from) {
            for (int i = from; i <= to; i++) path.add(i);
        } else {
            for (int i = from; i >= to; i--) path.add(i);
        }
        return path;
    }

    private String buildMessage(GameStateResponse.MoveEvent.MoveKind kind, String name, int from, int to, int roll, String powerUp) {
        return switch (kind) {
            case CLIMB -> name + " rolled " + roll + " and climbed a ladder to " + to + "!";
            case SLIDE -> name + " rolled " + roll + " and slid down a snake to " + to + ".";
            case BOUNCE -> name + " rolled " + roll + " but bounced back to " + to + ".";
            case SHIELD -> name + " rolled " + roll + " and blocked a snake with SHIELD, staying at " + to + ".";
            case WIN -> name + " wins!";
            default -> name + " rolled " + roll + " and moved to " + to + ".";
        };
    }

    private PlayerSeat findLeader(GameSession session, PlayerSeat self) {
        PlayerSeat best = null;
        for (PlayerSeat s : session.seats) {
            if (s == self || s.finished) continue;
            if (best == null || s.position > best.position) best = s;
        }
        return best;
    }

    /**
     * Called by REST endpoint when host creates a room and clicks Start.
     * Creates the authoritative GameSession and broadcasts initial state.
     */
    public GameStateResponse createAndStartSession(String roomCode, String hostName, GameMode mode, BoardVariant variant, Difficulty difficulty, List<String> playerNames) {
        GameSession session = new GameSession(roomCode, mode, variant, difficulty);
        session.board = boardService.generate(variant);

        // Add host first
        PlayerSeat host = new PlayerSeat(hostName, false, difficulty, PlayerSeat.COLORS[0]);
        session.seats.add(host);

        // Add other players
        for (int i = 1; i < playerNames.size(); i++) {
            String name = playerNames.get(i);
            PlayerSeat seat = new PlayerSeat(name, false, difficulty, PlayerSeat.COLORS[i % PlayerSeat.COLORS.length]);
            session.seats.add(seat);
        }

        session.status = GameStateResponse.GameStatus.PLAYING;
        session.log.add("Game started by host!");
        session.boardSequence++;
        session.boardChanged = true;

        sessions.put(roomCode, session);
        GameStateResponse initialState = session.snapshotFor(hostName);
        broadcastState(roomCode, initialState);

        return initialState;
    }

    /**
     * Get session for REST sync (e.g., on reconnect).
     */
    public GameSession getSession(String roomCode) {
        return sessions.get(roomCode.toUpperCase());
    }

    /**
     * Remove session when room closes.
     */
    public void removeSession(String roomCode) {
        sessions.remove(roomCode.toUpperCase());
    }
}