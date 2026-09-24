package com.arena.snakesladders.service;

import com.arena.snakesladders.dto.GameStateResponse;
import com.arena.snakesladders.model.Board;
import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;
import com.arena.snakesladders.model.enums.PowerUpType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GameService {

    private static final int MAX_PLAYERS = 4;

    private final BoardService boardService;
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, GameSession> sessions = new ConcurrentHashMap<>();
    private final Random random = new Random();

    public GameService(BoardService boardService) {
        this.boardService = boardService;
    }

    public RoomInfo createRoom(String username, String mode, String variant, String difficulty) {
        String host = normalizeName(username, "Player");
        GameMode gameMode = enumValue(GameMode.class, mode, GameMode.ONLINE);
        BoardVariant boardVariant = enumValue(BoardVariant.class, variant, BoardVariant.CLASSIC);
        Difficulty gameDifficulty = enumValue(Difficulty.class, difficulty, Difficulty.EASY);

        String code;
        synchronized (rooms) {
            do {
                code = String.valueOf(100000 + random.nextInt(900000));
            } while (rooms.containsKey(code));
            Room room = new Room(code, host, gameMode, boardVariant, gameDifficulty);
            room.players.add(host);
            rooms.put(code, room);
            return room.toInfo();
        }
    }

    public RoomInfo joinRoom(String code, String username) {
        String roomCode = normalizeCode(code);
        String playerName = normalizeName(username, "Player");
        synchronized (rooms) {
            Room room = requireRoom(roomCode);
            if (!room.containsPlayer(playerName)) {
                if (room.players.size() >= MAX_PLAYERS) {
                    throw new IllegalStateException("Room is full");
                }
                room.players.add(playerName);
            }
            return room.toInfo();
        }
    }

    public RoomInfo getRoom(String code) {
        synchronized (rooms) {
            return requireRoom(normalizeCode(code)).toInfo();
        }
    }

    public void closeRoom(String code) {
        String roomCode = normalizeCode(code);
        synchronized (rooms) {
            rooms.remove(roomCode);
        }
        sessions.remove(roomCode);
    }

    public GameStateResponse join(String code, String playerName, Map<String, Object> payload) {
        String roomCode = normalizeCode(code);
        String name = normalizeName(playerName, "Player");
        Room room = requireRoom(roomCode);

        synchronized (room) {
            boolean newPlayer = !room.containsPlayer(name);
            if (newPlayer) {
                if (room.players.size() >= MAX_PLAYERS) {
                    throw new IllegalStateException("Room is full");
                }
                room.players.add(name);
            }

            GameSession session = sessions.get(roomCode);
            if (session == null) {
                session = createSession(room);
                sessions.put(roomCode, session);
            }

            boolean added = false;
            if (session.seatByName(name) == null) {
                addSeat(session, name);
                added = true;
            }
            syncSeats(session, room.players);
            if (added) {
                session.log.add(name + " joined the game.");
            }
            session.lastEvent = null;
            return session.snapshotFor(name);
        }
    }

    public GameStateResponse start(String code, String playerName) {
        String roomCode = normalizeCode(code);
        String name = normalizeName(playerName, "Player");
        Room room = requireRoom(roomCode);

        synchronized (room) {
            if (!room.hostUsername.equalsIgnoreCase(name)) {
                throw new IllegalStateException("Only the host can start the game");
            }
            GameSession session = getSession(room);
            if (session.status != GameStateResponse.GameStatus.WAITING) {
                session.lastEvent = null;
                return session.snapshotFor(name);
            }

            session.status = GameStateResponse.GameStatus.PLAYING;
            session.log.add("Game started!");
            session.boardSequence++;
            session.boardChanged = true;
            session.lastEvent = null;
            return session.snapshotFor(name);
        }
    }

    public GameStateResponse roll(String code, String playerName) {
        String roomCode = normalizeCode(code);
        String name = normalizeName(playerName, "Player");
        GameSession session = requireSession(roomCode);

        synchronized (session.lock) {
            requirePlaying(session);
            PlayerSeat seat = requireSeat(session, name);
            if (session.current() != seat) {
                session.lastEvent = null;
                return session.snapshotFor(name);
            }

            session.lastEvent = null;
            if (!seat.canAct()) {
                if (seat.frozenTurns > 0) {
                    seat.frozenTurns--;
                    session.log.add(seat.name + " is frozen and skips.");
                }
                session.advanceTurn();
                return session.snapshotFor(name);
            }

            processTurn(session, seat);
            if (session.status == GameStateResponse.GameStatus.PLAYING) {
                session.advanceTurn();
            }
            return session.snapshotFor(name);
        }
    }

    public GameStateResponse usePowerUp(String code, String playerName, Map<String, Object> payload) {
        String roomCode = normalizeCode(code);
        String name = normalizeName(playerName, "Player");
        GameSession session = requireSession(roomCode);

        synchronized (session.lock) {
            requirePlaying(session);
            PlayerSeat seat = requireSeat(session, name);
            if (session.current() != seat) {
                session.lastEvent = null;
                return session.snapshotFor(name);
            }
            if (payload == null) {
                session.lastEvent = null;
                return session.snapshotFor(name);
            }

            Object typeValue = payload.get("type");
            if (typeValue == null) {
                session.lastEvent = null;
                return session.snapshotFor(name);
            }

            PowerUpType type;
            try {
                type = PowerUpType.valueOf(String.valueOf(typeValue).toUpperCase());
            } catch (IllegalArgumentException e) {
                session.lastEvent = null;
                return session.snapshotFor(name);
            }

            String targetName = payload.get("target") == null
                ? null
                : String.valueOf(payload.get("target"));
            switch (type) {
                case SHIELD:
                    if (!seat.shield) {
                        seat.shield = true;
                        session.log.add(seat.name + " activated SHIELD!");
                    }
                    break;
                case DOUBLE:
                    if (seat.doubleAvailable) {
                        seat.pendingDouble = true;
                        seat.doubleAvailable = false;
                        session.log.add(seat.name + " armed DOUBLE ROLL!");
                    }
                    break;
                case FREEZE:
                    PlayerSeat target = targetName == null
                        ? findLeader(session, seat)
                        : session.seatByName(targetName);
                    if (target != null && target != seat && seat.freezeAvailable) {
                        target.frozenTurns++;
                        seat.freezeAvailable = false;
                        session.log.add(seat.name + " froze " + target.name + "!");
                    }
                    break;
                default:
                    break;
            }

            session.lastEvent = null;
            return session.snapshotFor(name);
        }
    }

    public GameStateResponse leave(String code, String playerName) {
        String roomCode = normalizeCode(code);
        String name = normalizeName(playerName, "Player");
        GameSession session = requireSession(roomCode);

        synchronized (session.lock) {
            PlayerSeat seat = session.seatByName(name);
            if (seat != null && !seat.finished) {
                seat.finished = true;
                session.log.add(name + " left the game.");
                if (session.current() == seat) {
                    session.advanceTurn();
                }
                if (!hasActivePlayer(session)) {
                    session.status = GameStateResponse.GameStatus.FINISHED;
                }
            }
            session.lastEvent = null;
            return session.snapshotFor(name);
        }
    }

    public GameStateResponse chat(String code, String playerName, Map<String, Object> payload) {
        String roomCode = normalizeCode(code);
        String name = normalizeName(playerName, "Player");
        GameSession session = requireSession(roomCode);

        synchronized (session.lock) {
            requireSeat(session, name);
            String text = payload == null ? null : String.valueOf(payload.get("text"));
            if (text != null && !text.isBlank()) {
                session.log.add(name + ": " + text);
            }
            session.lastEvent = null;
            return session.snapshotFor(name);
        }
    }

    public GameSession getSession(String code) {
        return sessions.get(normalizeCode(code));
    }

    private GameSession createSession(Room room) {
        GameSession session = new GameSession(room.code, room.mode, room.variant, room.difficulty);
        session.board = boardService.generate(room.variant);
        for (String playerName : new ArrayList<>(room.players)) {
            addSeat(session, playerName);
        }
        return session;
    }

    private GameSession getSession(Room room) {
        GameSession session = sessions.get(room.code);
        if (session == null) {
            session = createSession(room);
            sessions.put(room.code, session);
        }
        return session;
    }

    private GameSession requireSession(String roomCode) {
        GameSession session = sessions.get(roomCode);
        if (session == null) {
            throw new IllegalStateException("Room is not active");
        }
        return session;
    }

    private Room requireRoom(String roomCode) {
        Room room = rooms.get(roomCode);
        if (room == null) {
            throw new IllegalStateException("Room not found");
        }
        return room;
    }

    private PlayerSeat requireSeat(GameSession session, String name) {
        PlayerSeat seat = session.seatByName(name);
        if (seat == null) {
            throw new IllegalStateException("Player is not in this room");
        }
        return seat;
    }

    private void requirePlaying(GameSession session) {
        if (session.status != GameStateResponse.GameStatus.PLAYING) {
            throw new IllegalStateException("Game has not started");
        }
    }

    private void syncSeats(GameSession session, List<String> players) {
        for (String playerName : players) {
            boolean found = false;
            for (PlayerSeat seat : session.seats) {
                if (seat.name.equalsIgnoreCase(playerName)) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                addSeat(session, playerName);
            }
        }
    }

    private void addSeat(GameSession session, String name) {
        String color = PlayerSeat.COLORS[session.seats.size() % PlayerSeat.COLORS.length];
        session.seats.add(new PlayerSeat(name, false, session.difficulty, color));
    }

    private void processTurn(GameSession session, PlayerSeat seat) {
        int size = session.board.getSize();
        int roll = seat.pendingDouble ? rollDie() + rollDie() : rollDie();
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

        GameStateResponse.MoveKind kind;
        List<Integer> path;
        if (session.board.getLadders().containsKey(to)) {
            int pre = to;
            to = session.board.getLadders().get(to);
            kind = GameStateResponse.MoveKind.CLIMB;
            path = buildPath(from, pre);
        } else if (session.board.getSnakes().containsKey(to)) {
            int pre = to;
            if (seat.shield) {
                seat.shield = false;
                kind = GameStateResponse.MoveKind.SHIELD;
                path = buildPath(from, pre);
                session.log.add(seat.name + " blocked a snake with SHIELD!");
            } else {
                to = session.board.getSnakes().get(to);
                kind = GameStateResponse.MoveKind.SLIDE;
                path = buildPath(from, pre);
            }
        } else {
            kind = bounced ? GameStateResponse.MoveKind.BOUNCE : GameStateResponse.MoveKind.MOVE;
            path = buildPath(from, to);
        }

        seat.position = to;
        PowerUpType powerUp = session.board.getPowerups().get(to);
        String powerUpName = null;
        if (powerUp != null && !seat.finished) {
            powerUpName = powerUp.name();
            switch (powerUp) {
                case SHIELD:
                    seat.shield = true;
                    break;
                case DOUBLE:
                    seat.doubleAvailable = true;
                    break;
                case FREEZE:
                    seat.freezeAvailable = true;
                    break;
                default:
                    break;
            }
            session.log.add(seat.name + " picked up " + powerUpName + "!");
        }

        if (to == size) {
            seat.finished = true;
            seat.placement = ++session.finishedCount;
            kind = GameStateResponse.MoveKind.WIN;
            if (session.winner == null) {
                session.winner = seat.name;
            }
            if (!hasActivePlayer(session)) {
                session.status = GameStateResponse.GameStatus.FINISHED;
            }
        } else if (session.variant == BoardVariant.CHAOS && session.turnCount % 3 == 0) {
            session.board = boardService.regenerateChaos();
            session.board.setSequence(session.boardSequence + 1);
            session.boardSequence++;
            session.boardChanged = true;
            session.log.add("CHAOS! The board reshuffled.");
        }

        GameStateResponse.MoveEvent event = new GameStateResponse.MoveEvent();
        event.kind = kind;
        event.player = seat.name;
        event.from = from;
        event.to = to;
        event.path = path;
        event.powerUp = powerUp;
        event.message = buildMessage(kind, seat.name, from, to, roll, powerUpName);
        session.lastEvent = event;
        session.log.add(event.message);
    }

    private boolean hasActivePlayer(GameSession session) {
        for (PlayerSeat seat : session.seats) {
            if (!seat.finished) {
                return true;
            }
        }
        return false;
    }

    private PlayerSeat findLeader(GameSession session, PlayerSeat self) {
        PlayerSeat leader = null;
        for (PlayerSeat seat : session.seats) {
            if (seat == self || seat.finished) {
                continue;
            }
            if (leader == null || seat.position > leader.position) {
                leader = seat;
            }
        }
        return leader;
    }

    private int rollDie() {
        return 1 + random.nextInt(6);
    }

    private List<Integer> buildPath(int from, int to) {
        List<Integer> path = new ArrayList<>();
        if (to >= from) {
            for (int tile = from; tile <= to; tile++) {
                path.add(tile);
            }
        } else {
            for (int tile = from; tile >= to; tile--) {
                path.add(tile);
            }
        }
        return path;
    }

    private String buildMessage(GameStateResponse.MoveKind kind, String name, int from, int to, int roll, String powerUp) {
        switch (kind) {
            case CLIMB:
                return name + " rolled " + roll + " and climbed a ladder to " + to + "!";
            case SLIDE:
                return name + " rolled " + roll + " and slid down a snake to " + to + ".";
            case BOUNCE:
                return name + " rolled " + roll + " but bounced back to " + to + ".";
            case SHIELD:
                return name + " rolled " + roll + " and blocked a snake with SHIELD, staying at " + to + ".";
            case WIN:
                return name + " wins!";
            case MOVE:
            default:
                return name + " rolled " + roll + " and moved to " + to + ".";
        }
    }

    private String normalizeCode(String code) {
        if (code == null) {
            throw new IllegalArgumentException("Room code is required");
        }
        String normalized = code.trim().toUpperCase();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("Room code is required");
        }
        return normalized;
    }

    private String normalizeName(String name, String fallback) {
        String normalized = name == null || name.trim().isEmpty() ? fallback : name.trim();
        if (normalized.length() > 40) {
            normalized = normalized.substring(0, 40);
        }
        return normalized;
    }

    private <E extends Enum<E>> E enumValue(Class<E> type, String value, E fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid " + type.getSimpleName() + ": " + value);
        }
    }

    public static class Room {
        private final String code;
        private final String hostUsername;
        private final GameMode mode;
        private final BoardVariant variant;
        private final Difficulty difficulty;
        private final List<String> players = new ArrayList<>();
        private final long createdAt = System.currentTimeMillis();

        Room(String code, String hostUsername, GameMode mode, BoardVariant variant, Difficulty difficulty) {
            this.code = code;
            this.hostUsername = hostUsername;
            this.mode = mode;
            this.variant = variant;
            this.difficulty = difficulty;
        }

        boolean containsPlayer(String name) {
            for (String player : players) {
                if (player.equalsIgnoreCase(name)) {
                    return true;
                }
            }
            return false;
        }

        RoomInfo toInfo() {
            List<Map<String, Object>> playerMaps = new ArrayList<>();
            for (int i = 0; i < players.size(); i++) {
                Map<String, Object> player = new java.util.HashMap<>();
                player.put("username", players.get(i));
                player.put("host", i == 0);
                playerMaps.add(player);
            }
            return new RoomInfo(code, hostUsername, mode, variant, difficulty, playerMaps,
                createdAt, System.currentTimeMillis());
        }
    }

    public static class RoomInfo {
        private final String roomCode;
        private final String hostUsername;
        private final GameMode mode;
        private final BoardVariant variant;
        private final Difficulty difficulty;
        private final List<Map<String, Object>> players;
        private final long createdAt;
        private final long now;

        RoomInfo(String roomCode, String hostUsername, GameMode mode, BoardVariant variant,
                 Difficulty difficulty, List<Map<String, Object>> players, long createdAt, long now) {
            this.roomCode = roomCode;
            this.hostUsername = hostUsername;
            this.mode = mode;
            this.variant = variant;
            this.difficulty = difficulty;
            this.players = players;
            this.createdAt = createdAt;
            this.now = now;
        }

        public String getRoomCode() {
            return roomCode;
        }

        public String getHostUsername() {
            return hostUsername;
        }

        public GameMode getMode() {
            return mode;
        }

        public BoardVariant getVariant() {
            return variant;
        }

        public Difficulty getDifficulty() {
            return difficulty;
        }

        public List<Map<String, Object>> getPlayers() {
            return players;
        }

        public long getCreatedAt() {
            return createdAt;
        }

        public long getNow() {
            return now;
        }
    }
}
