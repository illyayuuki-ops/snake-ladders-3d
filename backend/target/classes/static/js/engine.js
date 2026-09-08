/* ============================================================
   engine.js — fully client-side game engine (offline fallback).
   Mirrors the backend rules so Vs AI / Local play with NO server.
   Online mode still uses the Spring Boot REST + WebSocket backend.
   ============================================================ */
(function (global) {
    "use strict";

    const CLASSIC_LADDERS = [[1,38],[4,14],[9,31],[21,42],[28,84],[36,44],[51,67],[71,91],[80,100]];
    const CLASSIC_SNAKES  = [[16,6],[47,26],[49,11],[56,53],[62,19],[64,60],[87,24],[93,73],[95,75],[98,78]];

    function rnd(n) { return Math.floor(Math.random() * n); }

    class LocalEngine {
        constructor() { this.rng = Math.random; }

        _genBoard(variant) {
            const size = variant === "SPEED" ? 50 : 100;
            const b = { size, snakes: {}, ladders: {}, powerups: {} };
            if (variant === "CLASSIC" || variant === "POWERUP") {
                CLASSIC_LADDERS.forEach(([f, t]) => b.ladders[f] = t);
                CLASSIC_SNAKES.forEach(([f, t]) => b.snakes[f] = t);
                if (variant === "POWERUP") {
                    const cyc = ["SHIELD", "DOUBLE", "FREEZE"];
                    let i = 0;
                    [5,12,18,25,33,41,55,63,77,88].forEach(t => {
                        if (!b.ladders[t] && !b.snakes[t]) { b.powerups[t] = cyc[i % 3]; i++; }
                    });
                }
            } else if (variant === "CHAOS") {
                this._random(b, 100, 10, 10, false);
            } else { // SPEED
                this._random(b, 50, 9, 5, false);
            }
            return b;
        }

        _random(b, size, nl, ns, pu) {
            const occ = new Set([1, size]);
            let guard = 0;
            while (Object.keys(b.ladders).length < nl && guard++ < 2000) {
                const f = 2 + rnd(size - 2), gap = 8 + rnd(Math.max(12, size/3));
                let t = f + gap;
                if (t > size) t = size;
                if (t <= f || occ.has(t) || occ.has(f)) continue;
                b.ladders[f] = t; occ.add(f); occ.add(t);
            }
            guard = 0;
            while (Object.keys(b.snakes).length < ns && guard++ < 2000) {
                const h = 2 + rnd(size - 1), gap = 8 + rnd(Math.max(12, size/3));
                const tail = h - gap;
                if (tail < 2 || occ.has(tail) || occ.has(h)) continue;
                b.snakes[h] = tail; occ.add(h); occ.add(tail);
            }
        }

        create(cfg) {
            this.variant = cfg.variant; this.mode = cfg.mode; this.difficulty = cfg.difficulty || "EASY";
            this.board = this._genBoard(cfg.variant);
            this.seats = cfg.players.map(p => ({
                name: p.name, ai: !!p.ai, difficulty: p.difficulty || "EASY", color: p.color || "#ef4444",
                position: 0, shield: false, doubleAvailable: false, freezeAvailable: false, pendingDouble: false,
                frozenTurns: 0, finished: false, placement: 0, personalTurns: 0
            }));
            this.currentIndex = 0; this.dice = 0; this.turnCount = 0;
            this.status = "PLAYING"; this.winner = null; this.lastEvent = null; this.log = [];
            this.finishedCount = 0; this.boardSequence = 0; this.boardChanged = false;
            this.log.push("Local game started (" + cfg.variant + ").");
            return this.state();
        }

        current() { return this.seats[this.currentIndex]; }
        seat(name) { return this.seats.find(s => s.name === name); }
        advance() {
            const n = this.seats.length;
            for (let i = 1; i <= n; i++) {
                const idx = (this.currentIndex + i) % n;
                if (!this.seats[idx].finished) { this.currentIndex = idx; return; }
            }
            this.currentIndex = (this.currentIndex + 1) % n;
        }
        leader(self) {
            let best = null;
            for (const s of this.seats) { if (s === self || s.finished) continue; if (!best || s.position > best.position) best = s; }
            return best;
        }
        rollDie() { return 1 + rnd(6); }

        roll(player) {
            const seat = this.seat(player);
            if (!seat || this.status !== "PLAYING" || this.current() !== seat) return this.state();
            if (seat.frozenTurns > 0) {
                seat.frozenTurns--; this.log.push(seat.name + " is frozen and skips.");
                this.lastEvent = null; this.advance(); return this.state();
            }
            this._turn(seat);
            if (this.status === "PLAYING") this.advance();
            return this.state();
        }

        _turn(seat) {
            const size = this.board.size;
            if (seat.ai) {
                const ld = this.leader(seat);
                if (seat.freezeAvailable && (seat.difficulty === "EASY" ? Math.random() < 0.35 : (ld && ld.position - seat.position >= 3))) {
                    if (ld) { ld.frozenTurns++; seat.freezeAvailable = false; this.log.push(seat.name + " froze " + ld.name + "!"); }
                }
                if (seat.doubleAvailable && (seat.difficulty === "EASY" ? Math.random() < 0.35
                        : (size - seat.position <= 12 || (ld && ld.position - seat.position >= 4)))) {
                    seat.pendingDouble = true; seat.doubleAvailable = false;
                }
            }
            const roll = seat.pendingDouble ? (this.rollDie() + this.rollDie()) : this.rollDie();
            seat.pendingDouble = false;
            this.dice = roll; seat.personalTurns++; this.turnCount++;
            const from = seat.position, raw = from + roll;
            let to, bounced = false;
            if (raw > size) { to = 2 * size - raw; bounced = true; } else to = raw;
            let kind, path;
            if (this.board.ladders[to] != null) {
                const pre = to; to = this.board.ladders[to]; kind = "CLIMB"; path = this._path(from, pre);
            } else if (this.board.snakes[to] != null) {
                if (seat.shield) {
                    seat.shield = false; kind = "SHIELD"; path = this._path(from, to);
                    this.log.push(seat.name + " blocked a snake with SHIELD!");
                } else { const pre = to; to = this.board.snakes[to]; kind = "SLIDE"; path = this._path(from, pre); }
            } else { kind = bounced ? "BOUNCE" : "MOVE"; path = this._path(from, to); }
            seat.position = to;
            const pu = this.board.powerups[to];
            if (pu && !seat.finished) {
                if (pu === "SHIELD") seat.shield = true;
                else if (pu === "DOUBLE") seat.doubleAvailable = true;
                else if (pu === "FREEZE") seat.freezeAvailable = true;
                this.log.push(seat.name + " picked up " + pu + "!");
            }
            if (to === size) {
                seat.finished = true; this.finishedCount++; seat.placement = this.finishedCount;
                if (!this.winner) this.winner = seat.name; this._finish();
            } else if (this.variant === "CHAOS" && this.turnCount % 3 === 0) {
                this.board = this._genBoard("CHAOS"); this.boardSequence++; this.boardChanged = true;
                this.log.push("CHAOS! The board reshuffled.");
            }
            const ev = { kind, player: seat.name, from, to, path, powerUp: pu || null,
                message: this._msg(kind, seat.name, from, to, roll) };
            this.lastEvent = ev; this.log.push(ev.message);
        }

        _finish() {
            if (this.status === "FINISHED") return;
            this.status = "FINISHED";
            const rest = this.seats.slice().sort((a, b) => b.position - a.position);
            for (const s of rest) if (s.placement === 0) { this.finishedCount++; s.placement = this.finishedCount; }
            this.log.push("Match over! Winner: " + this.winner + ".");
        }

        usePowerUp(player, type, target) {
            const seat = this.seat(player);
            if (!seat || this.status !== "PLAYING" || this.current() !== seat) return this.state();
            if (type === "SHIELD") seat.shield = true;
            else if (type === "DOUBLE") { if (!seat.doubleAvailable) return this.state(); seat.pendingDouble = true; seat.doubleAvailable = false; }
            else if (type === "FREEZE") {
                if (!seat.freezeAvailable) return this.state();
                const t = target ? this.seat(target) : this.leader(seat);
                if (!t || t === seat) return this.state();
                t.frozenTurns++; seat.freezeAvailable = false; this.log.push(seat.name + " froze " + t.name + "!");
            }
            return this.state();
        }

        _path(from, to) {
            const p = []; if (to >= from) for (let i = from; i <= to; i++) p.push(i); else for (let i = from; i >= to; i--) p.push(i); return p;
        }
        _msg(kind, name, from, to, roll) {
            if (kind === "CLIMB") return name + " rolled " + roll + " and climbed a ladder to " + to + "!";
            if (kind === "SLIDE") return name + " rolled " + roll + " and slid down a snake to " + to + ".";
            if (kind === "BOUNCE") return name + " rolled " + roll + " but bounced back to " + to + ".";
            if (kind === "SHIELD") return name + " rolled " + roll + " and blocked a snake with SHIELD, staying at " + to + ".";
            return name + " rolled " + roll + " and moved to " + to + ".";
        }

        state() {
            const s = {
                roomCode: "LOCAL", mode: this.mode, variant: this.variant, difficulty: this.difficulty,
                size: this.board.size, currentTurn: this.currentIndex,
                currentPlayerName: this.seats.length ? this.current().name : null,
                dice: this.dice, turnCount: this.turnCount, status: this.status, winner: this.winner,
                boardSequence: this.boardSequence, boardChanged: this.boardChanged,
                snakes: Object.assign({}, this.board.snakes), ladders: Object.assign({}, this.board.ladders),
                powerups: Object.assign({}, this.board.powerups),
                players: this.seats.map((p, i) => ({
                    name: p.name, ai: p.ai, difficulty: p.difficulty, color: p.color, position: p.position,
                    shield: p.shield, hasDouble: p.doubleAvailable, hasFreeze: p.freezeAvailable,
                    frozen: p.frozenTurns, finished: p.finished, placement: p.placement,
                    personalTurns: p.personalTurns, isCurrent: i === this.currentIndex
                })),
                lastEvent: this.lastEvent, log: this.log.slice()
            };
            this.boardChanged = false;
            return s;
        }
    }

    global.LocalEngine = LocalEngine;
})(window);
