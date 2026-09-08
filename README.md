# 🐍🪜 3D Snakes & Ladders — Arena Edition

A responsive, **3D** Snakes & Ladders game for 2–4 local players.

* **Frontend:** HTML5, vanilla ES6 JavaScript, CSS 3D transforms (`perspective`, `rotateX/Y`, `preserve-3d`), Tailwind (CDN).
* **Backend:** Java 11 + Spring Boot (player profiles + leaderboard only).
* **Database:** H2 (default, zero-setup) or PostgreSQL (optional).

The Spring Boot app serves the REST API and static UI from a single port (`:8080`).

---

## ✨ Features

| Area | What you get |
|------|--------------|
| **Game modes** | Local (2–4 humans, one screen) |
| **Board variants** | `CLASSIC` (100 tiles), `POWERUP` (collectible 🛡 Shield / 🎲 Double / ❄ Freeze), `CHAOS` (snakes & ladders reshuffle every 3 turns), `SPEED` (50 tiles, dense ladders) |
| **3D UI** | Tilted/perspective 3D board, drag-to-rotate, scroll/pinch-to-zoom, floating ladders & snakes, standing pawns |
| **Animations** | Tumbling 3D dice, tokens that slide tile-by-tile and climb/slide 3D ladders & snakes, chaos reshuffle spin |
| **HUD** | Glassmorphism overlay: turn indicator, live player stats, scrolling game log, 🏆 leaderboard, audio toggle |
| **Edge cases** | Exact-roll bounce-back past tile 100 |
| **Persistence** | Player profiles, leaderboard by win-rate / total wins / fastest win |

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
cd backend
mvn package                 # produces target/snakes-ladders-3d.jar
java -jar target/snakes-ladders-3d.jar
# open http://localhost:8080
```

### Docker Compose (all services)

```bash
docker compose up --build
# frontend -> http://localhost:8000
# backend  -> http://localhost:8080
# db       -> localhost:5432
```

### PostgreSQL (optional)

```bash
docker compose up -d db    # starts PostgreSQL on :5432 (db/snakesladders)
mvn spring-boot:run -Dspring-boot.run.profiles=postgres
# or: java -jar target/snakes-ladders-3d.jar --spring.profiles.active=postgres
```

You can also override the datasource via environment variables:

```bash
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/snakesladders \
SPRING_DATASOURCE_USERNAME=postgres \
SPRING_DATASOURCE_PASSWORD=postgres \
java -jar target/snakes-ladders-3d.jar --spring.profiles.active=postgres
```

---

## 🧩 Project layout

```
snakes-ladders-3d/
├── backend/                      # Spring Boot app (serves API + static UI)
│   ├── pom.xml
│   └── src/main/java/com/arena/snakesladders/
│       ├── config/               # WebConfig (CORS), DataInitializer
│       ├── model/                # Player
│       ├── repository/           # JPA repositories
│       ├── service/              # Player, Leaderboard
│       ├── controller/           # Player, Leaderboard (REST)
│       ├── dto/                  # request/response
│       └── exception/            # global handler
│   └── src/main/resources/application.yml   # H2 default + postgres profile
└── frontend/
    ├── index.html
    ├── css/styles.css            # 3D scene, board, HUD, responsive
    ├── js/api.js                  # REST client
    ├── js/board3d.js              # 3D board / ladders / snakes / tokens / camera
    ├── js/dice.js                 # 3D dice cube
    ├── js/engine.js               # client-side game engine
    └── js/game.js                 # controller (setup, play, power-ups, audio)
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

---

## 🎮 How to play
1. Pick a **variant** (Classic / Power-Up / Chaos / Speed) and **players** (2–4).
2. Click **Start Game**.
3. Click **🎲 Roll Dice** on your turn. Land on 🪜 ladders / 🐍 snakes, grab ⚡ power-ups, and race to the final tile. Exact roll required — overshoot and you bounce back!
4. In `CHAOS`, the board rebuilds every 3 turns. In `SPEED`, it's a 50-tile sprint.

---

## 🛠 Troubleshooting

- **Port already in use:** change `server.port` in `application.yml` or stop the process using `:8080`.
- **CORS errors:** make sure you open the app via `http://...` and not `file://...`.
- **Database errors:** the default profile uses in-memory H2. For PostgreSQL, set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` environment variables, or use `--spring.profiles.active=postgres`.
