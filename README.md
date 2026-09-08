# 🐍🪜 3D Snakes & Ladders — Arena Edition

A full-stack, responsive, **3D** Snakes & Ladders game.

* **Frontend:** HTML5, vanilla ES6 JavaScript, CSS 3D transforms (`perspective`, `rotateX/Y`, `preserve-3d`), Tailwind (CDN, progressive), WebSockets (SockJS + STOMP).
* **Backend:** Java 11 + Spring Boot (REST + WebSocket/STOMP), Spring Data JPA / Hibernate.
* **Database:** H2 (default, zero-setup) or PostgreSQL (production profile).

The Spring Boot app serves **both** the REST/WebSocket API **and** the static UI from a single port (`:8080`), so there is nothing to wire up — open the app and play.

---

## ✨ Features

| Area | What you get |
|------|--------------|
| **Game modes** | Vs. AI (1 human vs. 1 bot, Easy/Smart), Local (2–4 humans, one screen), Online (room-code multiplayer over WebSocket) |
| **Board variants** | `CLASSIC` (100 tiles), `POWERUP` (collectible 🛡 Shield / 🎲 Double / ❄ Freeze), `CHAOS` (snakes & ladders reshuffle every 3 turns), `SPEED` (50 tiles, dense ladders) |
| **3D UI** | Tilted/perspective 3D board, drag-to-rotate, scroll/pinch-to-zoom, floating ladders & snakes, standing pawns |
| **Animations** | Tumbling 3D dice, tokens that slide tile-by-tile and climb/slide 3D ladders & snakes, chaos reshuffle spin |
| **HUD** | Glassmorphism overlay: turn indicator, live player stats, scrolling game log, 🏆 leaderboard, audio toggle |
| **Edge cases** | Exact-roll bounce-back past tile 100, player disconnect → AI auto-fill, full CRUD + leaderboard |
| **Persistence** | Player profiles, game history, persisted game-state snapshots, leaderboard by win-rate / total wins / fastest win |

---

## 🚀 Run it (H2, no setup)

```bash
cd backend
mvn spring-boot:run
# open http://localhost:8080
```

The app seeds a few demo players so the leaderboard isn't empty.
H2 console: `http://localhost:8080/h2-console` (JDBC `jdbc:h2:mem:snakesladders`).

> **Behind a TLS-intercepting proxy?** If dependency downloads fail with `handshake_failure`, build with
> `mvn -Dmaven.resolver.transport=wagon -Dmaven.artifact.threads=1 …` (the sandbox here needed this).

### Run the packaged jar
```bash
mvn package                 # produces target/snakes-ladders-3d.jar
java -jar target/snakes-ladders-3d.jar
```

### PostgreSQL (production)
```bash
docker compose up -d db    # starts PostgreSQL on :5432 (db/snakesladders)
mvn spring-boot:run -Dspring-boot.run.profiles=postgres
# or: java -jar target/snakes-ladders-3d.jar --spring.profiles.active=postgres
```

---

## 🧩 Project layout

```
snakes-ladders-3d/
├── backend/                      # Spring Boot app (also serves /frontend as static)
│   ├── pom.xml
│   └── src/main/java/com/arena/snakesladders/
│       ├── config/               # WebSocketConfig, WebConfig (CORS), DataInitializer
│       ├── model/                # Player, GameHistory, GameRoom + enums
│       ├── repository/           # JPA repositories
│       ├── service/              # Player, Leaderboard, Board, Bot, Game (engine)
│       ├── controller/           # Player, Leaderboard, Game (REST) + WebSocket (STOMP)
│       ├── dto/                  # request/response + WS messages
│       └── exception/            # global handler
│   └── src/main/resources/application.yml   # H2 default + postgres profile
└── frontend/
    ├── index.html
    ├── css/styles.css            # 3D scene, board, HUD, responsive
    ├── js/api.js                  # REST + SockJS/STOMP client
    ├── js/board3d.js              # 3D board / ladders / snakes / tokens / camera
    ├── js/dice.js                 # 3D dice cube
    └── js/game.js                 # controller (setup, play, AI, power-ups, audio)
```

---

## 🔌 API reference

### Players (`/api/players`)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/players` | list |
| GET | `/api/players/{id}` | by id |
| GET | `/api/players/username/{username}` | by name |
| POST | `/api/players` | create (or return existing) |
| POST | `/api/players/ensure` | idempotent lookup/create (used by the UI) |
| PUT | `/api/players/{id}` | rename |
| DELETE | `/api/players/{id}` | delete |

### Leaderboard (`/api/leaderboard?by=winrate|wins|fastest&limit=10`)
Returns ranked entries with `winRate`, `totalWins`, `fastestWinTurns`.

### Games (`/api/games`)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/games` | active sessions |
| POST | `/api/games` | create `{mode, variant, difficulty, players:[{name, ai, difficulty, color}]}` |
| GET | `/api/games/{code}` | state |
| POST | `/api/games/{code}/join?name=&ai=` | join an ONLINE room |
| POST | `/api/games/{code}/start` | start an ONLINE room |
| POST | `/api/games/{code}/roll?player=` | roll for the current player |
| POST | `/api/games/{code}/powerup?player=` | `{type: SHIELD|DOUBLE|FREEZE, target?}` |
| POST | `/api/games/{code}/leave?player=` | leave / disconnect |

### Real-time (WebSocket)
* Connect: `ws://host/ws` (SockJS)
* Subscribe: `/topic/room/{code}`
* Send: `/app/room` → `{type: JOIN|START|ROLL|USE_POWERUP|CHAT|LEAVE, roomCode, player, payload}`
* Out: `{type: STATE|EVENT|ERROR|INFO, state}`

---

## 🎮 How to play
1. Pick a **mode** (Vs AI / Local / Online), a **variant**, and **difficulty**.
2. **Vs AI:** you vs. one bot. **Local:** 2–4 names share the screen. **Online:** create a room, share the 6-digit code; friends join from another device.
3. Click **🎲 Roll Dice** on your turn. Land on 🪜 ladders / 🐍 snakes, grab ⚡ power-ups, and race to the final tile. Exact roll required — overshoot and you bounce back!
4. In `CHAOS`, the board rebuilds every 3 turns. In `SPEED`, it's a 50-tile sprint.
