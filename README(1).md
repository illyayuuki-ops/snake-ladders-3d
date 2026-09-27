# Snakes & Ladders 3D — Arena Edition

A cross-platform 3D Snakes & Ladders game built with **Flutter/Dart** (Android,
iOS, Web, Desktop) on top of a **server-authoritative Dart backend** with
persistent storage (PostgreSQL in production, SQLite for local dev).

```
snakes-ladders-3d/
├── shared/     # Pure-Dart authoritative game engine (rules, boards, state)
├── server/     # Backend: REST API + WebSocket real-time + DB (migrations/seed)
├── client/     # Flutter app: 3D board UI, offline engine binding, PWA (web)
└── README.md
```

The **one shared engine** (`shared/`) is used verbatim by the Flutter client
(offline VS_AI / LOCAL) and by the server (ONLINE), so results match
regardless of where a match is played.

---

## 1. Feature overview

| Modes | Description |
|---|---|
| `VS_AI` | One human vs. one bot (difficulty `EASY` / `SMART`) |
| `LOCAL` | 2–4 players sharing one device (hot-seat) |
| `ONLINE` | Host creates a room with a **6-digit code (100000–999999, unique)**; up to 4 players join from other devices; only the host (seat index 0) can start |

| Board variants | Description |
|---|---|
| `CLASSIC` | 100 tiles, fixed ladders & snakes (exact pairs below) |
| `POWERUP` | CLASSIC layout + power-ups on free tiles from `[5,12,18,25,33,41,55,63,77,88]`, cycling `SHIELD → DOUBLE → FREEZE`, skipping tiles occupied by ladders/snakes/1/100 |
| `CHAOS` | 100 tiles, randomised 10 ladders + 10 snakes; the board regenerates every 3 total turns (`boardSequence` increments) |
| `SPEED` | 50 tiles, randomised 9 ladders + 5 snakes — a sprint |

**CLASSIC ladders** (bottom→top): `(1,38) (4,14) (9,31) (21,42) (28,84) (36,44) (51,67) (71,91) (80,100)`
**CLASSIC snakes** (head→tail): `(16,6) (47,26) (49,11) (56,53) (62,19) (64,60) (87,24) (93,73) (95,75) (98,78)`

**Random-board generation** (CHAOS/SPEED): ladders go bottom→top with a gap of
`8 + rand(max(12, size/3))` (candidate top clamped to `size`), snakes go
head→tail with the same gap distribution (tail must be ≥ 2), never reusing
occupied tiles; tiles `1` and `size` are always occupied/reserved; generation
is guarded to 2000 attempts. (A clamped candidate that would land on a
reserved/occupied tile is rejected and re-rolled, so every placed snake/ladder
keeps its full `8 + rand(...)` gap.)

### Turn / movement rules

* Dice = 1–6. A player only acts on their own turn. Frozen players skip a turn
  and decrement their frozen counter (a skipped turn is not a move).
* `raw = position + roll`. If `raw > size`, bounce back: `to = 2*size - raw`
  (an **exact roll** lands on the final tile; overshoot bounces).
* After landing: tile has a ladder → **CLIMB** to its top; else tile has a
  snake → **SLIDE** to its tail, **unless** the player has an active `SHIELD`
  (consume shield, stay, event kind `SHIELD`); else `MOVE` (or `BOUNCE`).
* Power-up pickup happens on the **final landing tile** (after climb/slide).
* Reaching the final tile marks the player finished with a placement
  (1 = winner). First to finish sets the winner and ends the match; remaining
  players get placements ordered by descending position.
* CHAOS: after a move, if `turnCount % 3 == 0`, regenerate the board and
  increment `boardSequence`.
* Every turn produces an event `{kind, player, from, to, path, powerUp,
  message}` with kind `MOVE | CLIMB | SLIDE | BOUNCE | SHIELD` plus a
  human-readable log line.

### Power-ups (`SHIELD`, `DOUBLE`, `FREEZE`)

* `SHIELD` — blocks the next snake once (active from pickup; consumed on use).
* `DOUBLE` — next roll uses two dice summed (`pendingDouble`), armed via
  `USE_POWERUP`.
* `FREEZE` — adds a frozen turn to a target (default: the current leader);
  can't target yourself.
* A power-up can only be used on your own turn while the game is `PLAYING`.

### AI (`EASY`, `SMART`)

* `EASY` — uses `FREEZE` and `DOUBLE` randomly (~35% chance each per turn).
* `SMART` — uses `FREEZE` when the leader is ≥ 3 tiles ahead; uses `DOUBLE`
  when within 12 tiles of the win OR trailing the leader by ≥ 4.
* "Leader" = the furthest-ahead non-self, unfinished player. Bots auto-play.

### Data model

* **Player**: `id`, unique `username` (≤ 40 chars, case-insensitive uniqueness),
  `totalGames`, `totalWins`, `fastestWinTurns` (nullable), `createdAt`;
  derived `winRate = wins/games`.
* **GameHistory**: `id`, player FK, denormalized `playerUsername`, `mode`,
  `boardVariant`, `won`, `turns`, `placement`, `playedAt`.
* On match end, for each human player: stats increment (`games+1`, wins
  conditionally, `fastestWinTurns` if a faster win) **and** a `GameHistory`
  row — done by the server for ONLINE/server-side matches and mirrored in the
  client's local store for offline matches.

---

## 2. Quick start (local dev)

Prerequisites: [Dart SDK ≥ 3.4](https://dart.dev/get-dart) and
[Flutter ≥ 3.24](https://docs.flutter.dev/get-started/install) (any recent
stable works; tested with Dart 3.13 / Flutter 3.47). No database install is
needed for dev — SQLite is used automatically.

### 1. Backend (terminal A)

```bash
cd server
dart pub get
dart run bin/server.dart --port 8080 --db sqlite --db-path data/snakes.db
```

Migrations run at startup and demo players are seeded on an empty database
(so the leaderboard/analytics views are never blank). REST is served under
`/api/*`; the WebSocket is at `/ws`.

### 2. Flutter client (terminal B)

```bash
cd client
flutter pub get
flutter run            # pick Android/iOS emulator, Chrome, or a desktop target
```

VS_AI and LOCAL are fully playable immediately — the offline engine runs in
the app itself.

### 3. Play ONLINE across devices

1. Start the server on a machine reachable by all devices
   (same LAN is easiest, e.g. `http://192.168.1.20:8080`).
2. On the **home screen → "Multiplayer server"**, set that URL on every device.
3. Device A: **New match → ONLINE → Create room (host)**, note the 6-digit code.
4. Devices B–D: **ONLINE → Join with code**, enter the code and a name.
5. The host taps **START MATCH**; everyone sees the same board and each
   other's moves live; each device can only roll on its own turn.

> Web client (PWA): `cd client && flutter build web --release`, then serve
> `client/build/web` from any static host. The app is an installable PWA with
> a service worker caching the app shell (VS_AI/LOCAL work offline).

### 4. Production (PostgreSQL)

```bash
cd server
export DATABASE_URL='postgres://user:password@db-host:5432/snakes'
dart run bin/server.dart --port 8080 --db postgres --host 0.0.0.0
# (or pass --database-url postgres://... instead of the env var;
#  add ?sslmode=disable for local Postgres without TLS)
```

The same migrations (`server/migrations/001_init_postgres.sql`) are applied
automatically. Put the server behind TLS (reverse proxy) for production web
clients — browsers require `wss://` on HTTPS pages. The REST API sends CORS
headers (`access-control-allow-origin: *`) so browser clients can connect
cross-origin.

---

## 3. Backend API contract

Players:

```
GET    /api/players
GET    /api/players/{id}                     # profile + history[]
GET    /api/players/username/{username}      # profile + history[]
POST   /api/players            {username}    # 409 on duplicate (case-insensitive)
POST   /api/players/ensure     {username}    # idempotent create
PUT    /api/players/{id}       {username?, totalGames?, totalWins?, fastestWinTurns?}
DELETE /api/players/{id}
```

Leaderboard:

```
GET /api/leaderboard?by=winrate|wins|fastest&limit=10
# -> [{rank, id, username, winRate, totalGames, totalWins, fastestWinTurns}, ...]
#   winrate: winRate desc · wins: totalWins desc · fastest: fastestWinTurns asc (nulls last)
```

Games (server-authoritative; responses carry the full game state):

```
POST /api/games           {mode, variant, difficulty, players:[{name, ai, difficulty, color}]}
GET  /api/games                                  # active rooms
GET  /api/games/{code}
POST /api/games/{code}/join?name=&ai=[&difficulty=&color=]
POST /api/games/{code}/start[?player=]           # host (seat index 0) only
POST /api/games/{code}/roll?player=              # 409 when it's not that player's turn
POST /api/games/{code}/powerup?player=  {type, target?}
POST /api/games/{code}/leave?player=
```

Real-time (WebSocket `GET /ws`):

* subscribe to `/topic/room/{code}` — either send plain JSON
  `{"destination": "/topic/room/123456"}` or a STOMP `SUBSCRIBE` frame.
* send actions to `/app/room` as
  `{"type": "JOIN|START|ROLL|USE_POWERUP|CHAT|LEAVE", "roomCode": "...", "player": "...", "payload": {...}}`
  (plain JSON, or STOMP `SEND` with the JSON object as body).
* the server broadcasts `{"type": "STATE|EVENT|ERROR|INFO", "state": {...}, "message": "..."}`
  to every subscriber after every action (the message also carries
  `destination: /topic/room/{code}`). The server owns the one shared game per
  room and always broadcasts the full state, so all devices stay in sync.

Online sessions live in memory keyed by room code; only player profiles and
history persist to the DB.

### Game state shape (broadcast after every action)

```json
{
  "roomCode": "123456", "mode": "VS_AI|LOCAL|ONLINE",
  "variant": "CLASSIC|POWERUP|CHAOS|SPEED", "difficulty": "EASY|SMART|null",
  "size": 100, "currentTurn": 0, "currentPlayerName": "Alice",
  "dice": [4], "turnCount": 7, "status": "WAITING|PLAYING|FINISHED",
  "winner": null, "boardSequence": 0, "boardChanged": false,
  "snakes": {"16": 6}, "ladders": {"1": 38}, "powerups": {"5": "SHIELD"},
  "players": [{ "name": "Alice", "ai": false, "difficulty": null,
                "color": "#FF5252", "position": 12, "shield": false,
                "hasDouble": false, "hasFreeze": true, "frozen": 0,
                "finished": false, "placement": null, "personalTurns": 3 }],
  "lastEvent": { "kind": "CLIMB", "player": "Alice", "from": 3, "to": 31,
                 "path": [3,4,5,6,7,8,9,31], "powerUp": null, "message": "..." },
  "log": ["...human-readable lines..."]
}
```

`dice` is the list of rolled faces — one face normally, two faces when a
DOUBLE roll was used (sum = movement value). `boardChanged` is true only on
the broadcast produced by a CHAOS regeneration.

---

## 4. Database

Schema (see `server/migrations/`):

* `players(id, username, username_lower UNIQUE, total_games, total_wins,
  fastest_win_turns, created_at)`
* `game_history(id, player_id FK → players ON DELETE CASCADE,
  player_username, mode, board_variant, won, turns, placement, played_at)`

The SQLite (dev) and PostgreSQL (prod) drivers implement one `GameDatabase`
interface (`server/lib/src/db/`); migrations and the demo seed run at startup.
Timestamps are stored as ISO-8601 UTC text in both dialects for uniform
handling.

---

## 5. Tests

```bash
cd shared   && dart test        # 59 rule tests: exact pairs, bounce math, power-ups,
                                # freeze/double/shield, CHAOS regen, SPEED, placements,
                                # AI behaviour, JSON shape, 200 seeded full playouts
cd server   && dart test        # 20 end-to-end REST/WS contract tests (temp SQLite)
cd client   && flutter test     # engine binding + stats store smoke tests
```

`server/tool/online_demo.dart` runs a scripted two-device ONLINE acceptance
check against an in-process server (both devices stay in sync; out-of-turn
rolls are rejected):

```bash
cd server && dart run tool/online_demo.dart
```

---

## 6. Client UX notes

* **3D-style perspective board** — the 1..N serpentine track is painted with a
  perspective-tilted canvas (CustomPainter transform), with glossy tiles,
  ladders (rails + rungs), S-curved snakes, glowing power-up tokens and
  per-player colour pawns with shadows.
* **Animated tumbling dice** — spins through faces and settles on the roll
  (two dice when DOUBLE is used), **animated token movement** along the exact
  `lastEvent.path` (including the bounce walk over the final tile and back).
* **Glassmorphism HUD**, event log, toasts, winner overlay with final
  standings, power-up buttons with target picker (FREEZE), hot-seat prompts,
  and an "only on your turn" roll button for ONLINE.
* **Leaderboard** (win rate / total wins / fastest win; server or local),
  **per-player history**, and an **admin/analytics** view (player stats table +
  games-played-per-day chart).
* **Installable web PWA** — `web/manifest.json` + `web/sw.js` cache the app
  shell for offline use.

### Rule clarifications (deterministic choices where the spec allows)

* Players start off-board at position `0` (so tile 1 — including the CLASSIC
  `1→38` ladder — is landable on the first roll).
* A skipped (frozen) turn is not a move: it decrements the frozen counter and
  logs a line, but does not increment `turnCount` / `personalTurns` and
  produces no move event — so CHAOS regenerates every 3 *moves*.
* The match ends the moment someone lands on the final tile (winner = first
  finisher, placement 1); remaining players are ranked by descending position
  (ties: seat order). On abandonment (< 2 players left) the furthest-ahead
  player takes the win so "placement 1 = winner" always holds.
* `SHIELD` is active from pickup (the broadcast field `shield` is the active
  shield); `DOUBLE`/`FREEZE` are inventory flags (`hasDouble`, `hasFreeze`)
  armed via `USE_POWERUP`; a DOUBLE arm is visible in the next roll's `dice`
  faces.
