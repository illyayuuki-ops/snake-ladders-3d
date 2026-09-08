package com.arena.snakesladders.service;

import com.arena.snakesladders.dto.CreateGameRequest;
import com.arena.snakesladders.dto.GameStateResponse;
import com.arena.snakesladders.dto.UsePowerUpRequest;
import com.arena.snakesladders.model.Board;
import com.arena.snakesladders.model.GameRoom;
import com.arena.snakesladders.model.enums.BoardVariant;
import com.arena.snakesladders.model.enums.Difficulty;
import com.arena.snakesladders.model.enums.GameMode;
import com.arena.snakesladders.model.enums.PowerUpType;
import com.arena.snakesladders.repository.GameRoomRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import javax.persistence.EntityNotFoundException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.springframework.transaction.annotation.Transactional;

/**
 * Authoritative, in-memory game engine. Drives dice rolls, movement (with
 * bounce-back, ladders, snakes, shields), power-ups, the CHAOS reshuffle and win
 * detection, then persists a JSON snapshot of every state change.
 */
@Service
public class GameService {

    private final Map<String, GameSession> sessions = new ConcurrentHashMap<>();
    private final BoardService boardService;
    private final BotService botService;
    private final PlayerService playerService;
    private final GameRoomRepository roomRepository;
    private final ObjectMapper objectMapper;

    private static final String[] COLORS = {
            "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"
    };
    private final Random codeRng = new Random();

    public GameService(BoardService boardService, BotService botService,
                        PlayerService playerService, GameRoomRepository roomRepository,
                        ObjectMapper objectMapper) {
        this.boardService = boardService;
        this.botService = botService;
        this.playerService = playerService;
        this.roomRepository = roomRepository;
        this.objectMapper = objectMapper;
    }

    // ----------------------------------------------------------- session CRUD

    @Transactional
    public GameSession createSession(CreateGameRequest req) {
        String code = (req.getRoomCode() != null && !req.getRoomCode().isBlank())
                ? req.getRoomCode().toUpperCase() : generateRoomCode();

        GameSession s = new GameSession(code, req.getMode(), req.getVariant(), req.getDifficulty());
        s.board = boardService.generate(req.getVariant());

        if (req.getMode() == GameMode.ONLINE) {
            if (req.getPlayers() != null && !req.getPlayers().isEmpty()) {
                for (CreateGameRequest.SeatRequest sr : req.getPlayers()) {
                    addSeat(s, sr.getName(), sr.isAi(), sr.getDifficulty(), sr.getColor());
                }
            } else {
                String host = req.getHostUsername() != null ? req.getHostUsername() : "Host";
                addSeat(s, host, false, req.getDifficulty(), null);
            }
            s.status = GameStateResponse.GameStatus.WAITING;
        } else {
            for (CreateGameRequest.SeatRequest sr : req.getPlayers()) {
                addSeat(s, sr.getName(), sr.isAi(), sr.getDifficulty(), sr.getColor());
            }
            s.status = GameStateResponse.GameStatus.PLAYING;
        }
        s.log.add("Game created (" + req.getVariant() + ", " + req.getMode() + ").");
        persist(s);
        sessions.put(code, s);
        return s;
    }

    public GameSession require(String roomCode) {
        GameSession s = sessions.get(roomCode);
        if (s == null) throw new EntityNotFoundException("No active game for room " + roomCode);
        return s;
    }

    @Transactional
    public GameSession join(String roomCode, String name, boolean ai) {
        GameSession s = require(roomCode);
        synchronized (s.lock) {
            if (s.status != GameStateResponse.GameStatus.WAITING) {
                throw new IllegalStateException("Room is no longer accepting players.");
            }
            if (s.seats.size() >= 4) throw new IllegalStateException("Room is full (4 players).");
            addSeat(s, name, ai, s.difficulty, null);
            s.log.add(name + " joined the room.");
            persist(s);
            return s;
        }
    }

    @Transactional
    public GameSession start(String roomCode, String playerName) {
        GameSession s = require(roomCode);
        synchronized (s.lock) {
            if (s.seats.isEmpty()) throw new IllegalStateException("Need at least one player.");
            PlayerSeat requester = s.seatByName(playerName);
            if (requester == null || s.seats.indexOf(requester) != 0) {
                throw new IllegalStateException("Only the host can start the game.");
            }
            s.status = GameStateResponse.GameStatus.PLAYING;
            s.log.add("Match started by " + playerName + "!");
            persist(s);
            return s;
        }
    }

    /** Disconnect handling: auto-fill the seat with an AI so the game continues. */
    @Transactional
    public GameSession handleDisconnect(String roomCode, String name) {
        GameSession s = require(roomCode);
        synchronized (s.lock) {
            PlayerSeat seat = s.seatByName(name);
            if (seat == null) return s;
            if (s.status == GameStateResponse.GameStatus.WAITING) {
                s.seats.remove(seat);
                s.log.add(name + " left the lobby.");
            } else {
                seat.ai = true;
                seat.difficulty = Difficulty.EASY;
                s.log.add(name + " disconnected — replaced by an AI bot.");
            }
            persist(s);
            return s;
        }
    }

    // --------------------------------------------------------------- gameplay

    @Transactional
    public GameSession roll(String roomCode, String playerName) {
        GameSession s = require(roomCode);
        synchronized (s.lock) {
            PlayerSeat seat = s.seatByName(playerName);
            if (seat == null) throw new EntityNotFoundException("Unknown player: " + playerName);
            if (s.status != GameStateResponse.GameStatus.PLAYING) {
                throw new IllegalStateException("Game is not in progress.");
            }
            if (s.current() != seat) throw new IllegalStateException("It is not " + playerName + "'s turn.");

            // Frozen players automatically skip their turn.
            if (seat.frozenTurns > 0) {
                seat.frozenTurns--;
                s.log.add(seat.name + " is frozen and skips this turn.");
                s.lastEvent = null;
                s.advanceTurn();
                persist(s);
                return s;
            }

            performTurn(s, seat);

            if (s.status == GameStateResponse.GameStatus.PLAYING) {
                s.advanceTurn();
            }
            persist(s);
            return s;
        }
    }

    @Transactional
    public GameSession usePowerUp(String roomCode, String playerName, UsePowerUpRequest req) {
        GameSession s = require(roomCode);
        synchronized (s.lock) {
            PlayerSeat seat = s.seatByName(playerName);
            if (seat == null) throw new EntityNotFoundException("Unknown player: " + playerName);
            if (s.status != GameStateResponse.GameStatus.PLAYING) {
                throw new IllegalStateException("Game is not in progress.");
            }
            if (s.current() != seat) throw new IllegalStateException("You can only use power-ups on your turn.");

            switch (req.getType()) {
                case SHIELD:
                    seat.shield = true;
                    s.log.add(seat.name + " activated a SHIELD.");
                    break;
                case DOUBLE:
                    if (!seat.doubleAvailable) throw new IllegalStateException("No DOUBLE power-up available.");
                    seat.pendingDouble = true;
                    seat.doubleAvailable = false;
                    s.log.add(seat.name + " armed a DOUBLE roll.");
                    break;
                case FREEZE:
                    if (!seat.freezeAvailable) throw new IllegalStateException("No FREEZE power-up available.");
                    PlayerSeat target = (req.getTarget() != null) ? s.seatByName(req.getTarget()) : botService.currentLeader(s, seat);
                    if (target == null || target == seat) throw new IllegalStateException("No valid freeze target.");
                    target.frozenTurns += 1;
                    seat.freezeAvailable = false;
                    s.log.add(seat.name + " froze " + target.name + "!");
                    break;
                default:
                    throw new IllegalStateException("Unknown power-up.");
            }
            persist(s);
            return s;
        }
    }

    private void performTurn(GameSession s, PlayerSeat seat) {
        int size = s.board.getSize();

        // Bots spend power-ups tactically before rolling.
        if (seat.ai) {
            if (seat.freezeAvailable && botService.shouldUseFreeze(s, seat)) {
                PlayerSeat t = botService.currentLeader(s, seat);
                if (t != null) {
                    t.frozenTurns += 1;
                    seat.freezeAvailable = false;
                    s.log.add(seat.name + " froze " + t.name + "!");
                }
            }
            if (seat.doubleAvailable && botService.shouldUseDouble(s, seat)) {
                seat.pendingDouble = true;
                seat.doubleAvailable = false;
            }
        }

        int roll = seat.pendingDouble ? (botService.rollDie() + botService.rollDie()) : botService.rollDie();
        seat.pendingDouble = false;
        s.dice = roll;
        seat.personalTurns += 1;
        s.turnCount += 1;

        int from = seat.position;
        int raw = from + roll;
        int to;
        boolean bounced = false;
        if (raw > size) {
            to = 2 * size - raw;       // exact-roll bounce-back past the goal
            bounced = true;
        } else {
            to = raw;
        }

        GameStateResponse.MoveKind kind;
        Integer ladder = s.board.ladderFrom(to);
        List<Integer> path;
        if (ladder != null) {
            int preTo = to;
            to = ladder;
            kind = GameStateResponse.MoveKind.CLIMB;
            path = tilesBetween(from, preTo);
        } else {
            Integer snake = s.board.snakeFrom(to);
            if (snake != null) {
                if (seat.shield) {
                    seat.shield = false;
                    kind = GameStateResponse.MoveKind.SHIELD;
                    path = tilesBetween(from, to);
                    s.log.add(seat.name + " blocked a snake with SHIELD!");
                } else {
                    int preTo = to;
                    to = snake;
                    kind = GameStateResponse.MoveKind.SLIDE;
                    path = tilesBetween(from, preTo);
                }
            } else {
                kind = bounced ? GameStateResponse.MoveKind.BOUNCE : GameStateResponse.MoveKind.MOVE;
                path = tilesBetween(from, to);
            }
        }

        seat.position = to;

        // Power-up pickup on the final tile.
        PowerUpType pu = s.board.powerUpAt(to);
        if (pu != null && !seat.finished) {
            applyPickup(seat, pu);
            s.log.add(seat.name + " picked up " + pu + "!");
        }

        if (to == size) {
            seat.finished = true;
            s.finishedCount += 1;
            seat.placement = s.finishedCount;
            if (s.winner == null) s.winner = seat.name;
            finishGame(s);
        } else if (s.variant == BoardVariant.CHAOS && s.turnCount % 3 == 0) {
            s.board = boardService.regenerateChaos();
            s.boardSequence += 1;
            s.boardChanged = true;
            s.log.add("CHAOS! The board reshuffled.");
        }

        GameStateResponse.MoveEvent ev = new GameStateResponse.MoveEvent();
        ev.kind = kind;
        ev.player = seat.name;
        ev.from = from;
        ev.to = to;
        ev.path = path;
        ev.powerUp = pu;
        ev.message = describe(kind, seat.name, from, to, roll);
        s.lastEvent = ev;
        s.log.add(ev.message);
    }

    private void applyPickup(PlayerSeat seat, PowerUpType pu) {
        switch (pu) {
            case SHIELD:
                seat.shield = true;
                break;
            case DOUBLE:
                seat.doubleAvailable = true;
                break;
            case FREEZE:
                seat.freezeAvailable = true;
                break;
        }
    }

    @Transactional
    private void finishGame(GameSession s) {
        if (s.status == GameStateResponse.GameStatus.FINISHED) return;
        s.status = GameStateResponse.GameStatus.FINISHED;
        List<PlayerSeat> rest = new ArrayList<>(s.seats);
        rest.sort((a, b) -> Integer.compare(b.position, a.position));
        for (PlayerSeat seat : rest) {
            if (seat.placement == 0) {
                s.finishedCount += 1;
                seat.placement = s.finishedCount;
            }
        }
        // Persist results for every human participant.
        for (PlayerSeat seat : s.seats) {
            if (seat.ai) continue;
            var p = playerService.createOrGet(seat.name);
            boolean won = seat.name.equals(s.winner);
            playerService.recordMatch(p, s.mode, s.variant, won, seat.personalTurns, seat.placement);
        }
        s.log.add("Match over! Winner: " + s.winner + ".");
    }

    // --------------------------------------------------------------- mapping

    public GameStateResponse toResponse(GameSession s, String yourName) {
        GameStateResponse r = toResponseInternal(s, yourName);
        // A board-changed flag is consumed by the very next response we send to clients.
        s.boardChanged = false;
        return r;
    }

    private GameStateResponse toResponseInternal(GameSession s, String yourName) {
        GameStateResponse r = new GameStateResponse();
        r.roomCode = s.roomCode;
        r.mode = s.mode;
        r.variant = s.variant;
        r.difficulty = s.difficulty;
        r.size = s.board.getSize();
        r.currentTurn = s.currentIndex;
        r.currentPlayerName = s.seats.isEmpty() ? null : s.current().name;
        r.dice = s.dice;
        r.turnCount = s.turnCount;
        r.status = s.status;
        r.winner = s.winner;
        r.boardSequence = s.boardSequence;
        r.boardChanged = s.boardChanged;
        r.yourName = yourName;

        r.snakes.putAll(s.board.getSnakes());
        r.ladders.putAll(s.board.getLadders());
        for (Map.Entry<Integer, PowerUpType> e : s.board.getPowerups().entrySet()) {
            r.powerups.put(e.getKey(), e.getValue().name());
        }

        for (int i = 0; i < s.seats.size(); i++) {
            PlayerSeat seat = s.seats.get(i);
            GameStateResponse.PlayerState ps = new GameStateResponse.PlayerState();
            ps.name = seat.name;
            ps.ai = seat.ai;
            ps.difficulty = seat.difficulty;
            ps.color = seat.color;
            ps.position = seat.position;
            ps.shield = seat.shield;
            ps.hasDouble = seat.doubleAvailable;
            ps.hasFreeze = seat.freezeAvailable;
            ps.frozen = seat.frozenTurns;
            ps.finished = seat.finished;
            ps.placement = seat.placement;
            ps.isCurrent = (i == s.currentIndex);
            r.players.add(ps);
        }

        r.lastEvent = s.lastEvent;
        r.log.addAll(s.log);
        return r;
    }

    public List<GameStateResponse> activeSummaries() {
        return sessions.values().stream()
                .map(s -> toResponseInternal(s, null))
                .collect(Collectors.toList());
    }

    // --------------------------------------------------------------- helpers

    private List<Integer> tilesBetween(int from, int to) {
        List<Integer> p = new ArrayList<>();
        if (to >= from) {
            for (int i = from; i <= to; i++) p.add(i);
        } else {
            for (int i = from; i >= to; i--) p.add(i);
        }
        return p;
    }

    private String describe(GameStateResponse.MoveKind kind, String name, int from, int to, int roll) {
        switch (kind) {
            case CLIMB:
                return name + " rolled " + roll + " and climbed a ladder to " + to + "!";
            case SLIDE:
                return name + " rolled " + roll + " and slid down a snake to " + to + ".";
            case BOUNCE:
                return name + " rolled " + roll + " but bounced back to " + to + ".";
            case SHIELD:
                return name + " rolled " + roll + " and blocked a snake with SHIELD, staying at " + to + ".";
            case MOVE:
            default:
                return name + " rolled " + roll + " and moved to " + to + ".";
        }
    }

    private void addSeat(GameSession s, String name, boolean ai, Difficulty diff, String color) {
        String finalName = name;
        int suffix = 1;
        while (s.seatByName(finalName) != null) {
            finalName = name + (++suffix);
        }
        String finalColor = (color != null && !color.isBlank())
                ? color : COLORS[s.seats.size() % COLORS.length];
        s.seats.add(new PlayerSeat(finalName, ai, diff, finalColor));
    }

    private String generateRoomCode() {
        String code;
        do {
            code = Integer.toString(100000 + codeRng.nextInt(900000)); // 6-digit numeric
        } while (sessions.containsKey(code) || roomRepository.findByRoomCode(code).isPresent());
        return code;
    }

    private void persist(GameSession s) {
        GameRoom room = roomRepository.findByRoomCode(s.roomCode)
                .orElseGet(() -> new GameRoom(s.roomCode,
                        s.seats.isEmpty() ? "Host" : s.seats.get(0).name,
                        s.mode, s.variant, s.difficulty));
        room.setMode(s.mode);
        room.setBoardVariant(s.variant);
        room.setDifficulty(s.difficulty);
        room.setPlayers(s.seats.stream().map(x -> x.name).collect(Collectors.joining(",")));
        room.setStatus(s.status.name());
        room.setStateJson(snapshotJson(s));
        room.setUpdatedAt(LocalDateTime.now());
        roomRepository.save(room);
    }

    private String snapshotJson(GameSession s) {
        try {
            return objectMapper.writeValueAsString(toResponseInternal(s, null));
        } catch (Exception e) {
            return "{}";
        }
    }
}
