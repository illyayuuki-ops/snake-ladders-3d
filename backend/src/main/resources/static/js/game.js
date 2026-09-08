/* ============================================================
   game.js — controller: setup, REST + WebSocket play, 3D board,
   dice, AI auto-play, power-ups, chaos reshuffle, HUD, audio.
   ============================================================ */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const PALETTE = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"];

    const G = {
        api: new Api(),
        board: null, dice: null,
        code: null, mode: null, variant: null, myName: null,
        online: false, busy: false, lastState: null,
        built: false, builtCode: null, builtSize: 0,
        soundOn: true, audio: null,
        config: { mode: "VS_AI", variant: "CLASSIC", difficulty: "EASY", name: "Player 1", localCount: 2, localNames: [] },
        joinCode: null,
        local: false, engine: null, stateQueue: null, joining: false
    };

    /* ---------------- audio ---------------- */
    function ensureAudio() {
        if (!G.audio) { try { G.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    }
    function beep(freq, dur, type, vol) {
        if (!G.soundOn || !G.audio) return;
        const o = G.audio.createOscillator(), g = G.audio.createGain();
        o.type = type || "sine"; o.frequency.value = freq;
        g.gain.value = vol || 0.06;
        o.connect(g); g.connect(G.audio.destination);
        const t = G.audio.currentTime;
        o.start(t); g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.15));
        o.stop(t + (dur || 0.15));
    }
    function sound(kind) {
        if (kind === "roll") { beep(220, 0.08, "square", 0.05); setTimeout(() => beep(330, 0.08, "square", 0.05), 90); }
        else if (kind === "ladder") { beep(440, 0.1, "triangle", 0.07); setTimeout(() => beep(660, 0.12, "triangle", 0.07), 100); }
        else if (kind === "snake") { beep(400, 0.12, "sawtooth", 0.06); setTimeout(() => beep(180, 0.16, "sawtooth", 0.06), 110); }
        else if (kind === "power") { beep(520, 0.1, "triangle", 0.07); setTimeout(() => beep(780, 0.1, "triangle", 0.07), 90); }
        else if (kind === "win") { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, "triangle", 0.08), i * 130)); }
    }

    /* ---------------- toast / status ---------------- */
    let toastTimer = null;
    function toast(msg) {
        const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
        clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
    }
    function setRollLabel(text, enabled) {
        const b = $("btn-roll"); b.textContent = text; b.disabled = !enabled;
    }

    /* ---------------- board build guard ---------------- */
    function ensureBuild(st) {
        if (!G.built || G.builtCode !== st.roomCode || G.builtSize !== st.size) {
            G.board.build(st);
            G.built = true; G.builtCode = st.roomCode; G.builtSize = st.size;
        }
    }

    /* ---------------- apply a state (animate if it carries a move) ---------------- */
    function applyState(st, animate) {
        G.lastState = st;
        ensureBuild(st);
        if (animate && st.lastEvent) {
            if (G.busy) {
                stateQueue = { st, animate };
                return;
            }
            G.busy = true;
            setRollLabel("Rolling…", false);
            if (st.lastEvent.kind === "CLIMB") sound("ladder");
            else if (st.lastEvent.kind === "SLIDE") sound("snake");
            else if (st.lastEvent.powerUp) sound("power");
            else sound("roll");
            G.dice.roll(st.dice, () => {
                G.board.moveAlong(st.lastEvent.player, st.lastEvent.path, st.lastEvent.to, st.lastEvent.kind, () => afterMove(st));
            });
        } else {
            if (st.boardChanged) G.board.respawnBoard(st);
            st.players.forEach(p => G.board.placeToken(p.name, p.position, false));
            afterMove(st);
        }
    }

    function afterMove(st) {
        if (st.boardChanged) G.board.respawnBoard(st);
        G.board.setCurrent(st.currentPlayerName);
        renderState(st);
        G.busy = false;
        if (stateQueue) {
            const next = stateQueue;
            stateQueue = null;
            applyState(next.st, next.animate);
            return;
        }
        if (st.status === "FINISHED") {
            if (G.local) saveLocalResult(st);
            onWin(st);
            return;
        }
        scheduleNext(st);
    }

    function scheduleNext(st) {
        const startBtn = $("btn-start-online");
        if (startBtn) startBtn.classList.toggle("hidden", !(G.online && st.status === "WAITING"));
        if (st.status !== "PLAYING") {
            setRollLabel(st.status === "WAITING" ? "Waiting…" : "Finished", false);
            return;
        }
        const cur = st.players.find(p => p.name === st.currentPlayerName);
        if (!cur) return;
        if (cur.ai) {
            setRollLabel("🤖 " + cur.name + "…", false);
            const amHost = !G.online || (st.players[0] && st.players[0].name === G.myName);
            if (amHost) {
                const expected = cur.name;
                setTimeout(() => {
                    if (!G.busy && G.lastState && G.lastState.currentPlayerName === expected) {
                        doRoll(expected);
                    }
                }, 780);
            }
            return;
        }
        if (G.online) {
            if (cur.name === G.myName) setRollLabel("🎲 Roll Dice", true);
            else setRollLabel("⏳ " + cur.name + "…", false);
        } else {
            setRollLabel("🎲 " + cur.name + ", roll!", true);
        }
        renderPowerups(st, cur);
    }

    /* ---------------- actions ---------------- */
    function doRoll(player) {
        if (G.busy || !G.code) return;
        setRollLabel("Rolling…", false);
        sound("roll");
        if (G.local) {
            const st = G.engine.roll(player);
            applyState(st, true);
        } else if (G.online) {
            const sent = G.api.sendRoom(G.code, "ROLL", player);
            if (!sent) toast("Not connected to server.");
        } else {
            G.api.roll(G.code, player)
                .then(st => applyState(st, true))
                .catch(err => toast("Error: " + err.message));
        }
    }

    function usePowerup(type) {
        if (G.busy || !G.code) return;
        const st = G.lastState; if (!st) return;
        const cur = st.players.find(p => p.name === st.currentPlayerName);
        if (!cur) return;
        const target = currentLeader(st, cur);
        setRollLabel("Using…", false);
        if (G.local) {
            const s = G.engine.usePowerUp(cur.name, type, target ? target.name : null);
            applyState(s, false);
        } else if (G.online) {
            const sent = G.api.sendRoom(G.code, "USE_POWERUP", cur.name, { type, target: target ? target.name : null });
            if (!sent) toast("Not connected to server.");
        } else {
            G.api.powerup(G.code, cur.name, type, target ? target.name : null)
                .then(s => applyState(s, false))
                .catch(err => toast("Error: " + err.message));
        }
    }

    function currentLeader(st, self) {
        let best = null;
        for (const p of st.players) {
            if (p === self || p.finished) continue;
            if (!best || p.position > best.position) best = p;
        }
        return best;
    }

    /* ---------------- rendering ---------------- */
    function renderState(st) {
        $("mode-label").textContent = (G.online ? "Online · " : "") + st.mode + (st.difficulty ? " · " + st.difficulty : "");
        $("room-code").textContent = st.roomCode || "—";
        $("turn-count").textContent = st.turnCount;
        $("variant-label").textContent = st.variant;
        G.dice.snap(st.dice || 1);

        // players
        const ul = $("players-list"); ul.innerHTML = "";
        st.players.forEach(p => {
            const li = document.createElement("li");
            li.className = "player-row" + (p.name === st.currentPlayerName ? " active" : "");
            const dot = document.createElement("span"); dot.className = "dot";
            dot.style.background = p.color; dot.style.color = p.color;
            const nm = document.createElement("span"); nm.className = "pname"; nm.textContent = p.name + (p.ai ? " 🤖" : "");
            const meta = document.createElement("span"); meta.className = "pmeta";
            let badges = [];
            if (p.shield) badges.push("🛡");
            if (p.hasDouble) badges.push("🎲x2");
            if (p.hasFreeze) badges.push("❄");
            if (p.finished) badges.push("#" + p.placement);
            meta.textContent = (p.position) + (badges.length ? " " + badges.join("") : "");
            li.appendChild(dot); li.appendChild(nm); li.appendChild(meta);
            ul.appendChild(li);
        });

        // log (last 40)
        const log = $("log-list"); log.innerHTML = "";
        (st.log || []).slice(-40).forEach(line => {
            const li = document.createElement("li"); li.textContent = line; log.appendChild(li);
        });
        log.scrollTop = log.scrollHeight;
    }

    function renderPowerups(st, cur) {
        const wrap = $("powerups"); wrap.innerHTML = "";
        if (!cur || cur.ai) return;
        if (G.online && cur.name !== G.myName) return;
        if (cur.hasDouble) {
            const b = document.createElement("button"); b.className = "pw-btn"; b.textContent = "🎲 Double Roll";
            b.onclick = () => usePowerup("DOUBLE"); wrap.appendChild(b);
        }
        if (cur.hasFreeze) {
            const t = currentLeader(st, cur);
            if (t) {
                const b = document.createElement("button"); b.className = "pw-btn"; b.textContent = "❄️ Freeze " + t.name;
                b.onclick = () => usePowerup("FREEZE"); wrap.appendChild(b);
            }
        }
        if (cur.shield) {
            const b = document.createElement("button"); b.className = "pw-btn"; b.disabled = true; b.textContent = "🛡 Shield";
            wrap.appendChild(b);
        }
    }

    function onWin(st) {
        if (st.winner) G.board.setWin(st.winner);
        sound("win");
        const overlay = $("win-overlay");
        $("win-title").textContent = (st.winner || "Someone") + " wins!";
        const order = st.players.slice().sort((a, b) => a.placement - b.placement);
        $("win-sub").innerHTML = order.map(p => "#" + p.placement + " " + p.name + " (tile " + p.position + ")").join("<br>");
        overlay.classList.remove("hidden");
        loadLeaderboard($("leaderboard-panel").querySelector(".lb-tabs button.active").dataset.by);
    }

    /* ---------------- leaderboard ---------------- */
    function loadLeaderboard(by) {
        if (G.local) {
            renderLocalLeaderboard(by);
            return;
        }
        G.api.leaderboard(by, 10).then(list => {
            const ol = $("leaderboard-list"); ol.innerHTML = "";
            list.forEach(e => {
                const li = document.createElement("li");
                const meta = by === "fastest" ? (e.fastestWinTurns != null ? e.fastestWinTurns + " turns" : "—")
                    : by === "wins" ? (e.totalWins + " wins") : Math.round(e.winRate * 100) + "% · " + e.totalWins + "W";
                li.innerHTML = "<b>" + e.username + "</b> <span class='lb-meta'>" + meta + "</span>";
                ol.appendChild(li);
            });
        }).catch(() => renderLocalLeaderboard(by));
    }

    /* ---------- offline (localStorage) leaderboard ---------- */
    function loadLocalLeaderboard() {
        try { return JSON.parse(localStorage.getItem("sl3d_lb") || "[]"); } catch (e) { return []; }
    }
    function saveLocalResult(st) {
        const lb = loadLocalLeaderboard();
        st.players.forEach(p => {
            let e = lb.find(x => x.username === p.name);
            if (!e) { e = { username: p.name, totalGames: 0, totalWins: 0, fastestWinTurns: null }; lb.push(e); }
            e.totalGames++;
            if (p.name === st.winner) e.totalWins++;
            if (p.name === st.winner && (e.fastestWinTurns == null || (p.personalTurns || 0) < e.fastestWinTurns))
                e.fastestWinTurns = p.personalTurns || 0;
        });
        try { localStorage.setItem("sl3d_lb", JSON.stringify(lb)); } catch (e) {}
    }
    function renderLocalLeaderboard(by) {
        const lb = loadLocalLeaderboard();
        let sorted = lb.slice();
        if (by === "wins") sorted.sort((a, b) => b.totalWins - a.totalWins || a.totalGames - b.totalGames);
        else if (by === "fastest") sorted.sort((a, b) => (a.fastestWinTurns || 1e9) - (b.fastestWinTurns || 1e9));
        else sorted.sort((a, b) => (b.totalWins / (b.totalGames || 1)) - (a.totalWins / (a.totalGames || 1)));
        const ol = $("leaderboard-list"); ol.innerHTML = "";
        sorted.slice(0, 10).forEach(e => {
            const li = document.createElement("li");
            const meta = by === "fastest" ? (e.fastestWinTurns != null ? e.fastestWinTurns + " turns" : "—")
                : by === "wins" ? (e.totalWins + " wins") : Math.round((e.totalWins / (e.totalGames || 1)) * 100) + "% · " + e.totalWins + "W";
            li.innerHTML = "<b>" + e.username + "</b> <span class='lb-meta'>" + meta + "</span>";
            ol.appendChild(li);
        });
    }

    /* ---------------- websocket ---------------- */
    function onWs(msg) {
        if (msg.type === "STATE" && msg.state) {
            G.joining = false;
            applyState(msg.state, !!msg.state.lastEvent);
        } else if (msg.type === "ERROR") {
            if (G.joining) {
                G.joining = false;
                $("setup-modal").classList.remove("hidden");
            }
            toast("⚠ " + msg.message);
        } else if (msg.type === "INFO") {
            toast(msg.message);
        }
    }

    /* ---------------- start game ---------------- */
    async function startGame(join) {
        ensureAudio();
        const cfg = G.config;
        const name = ($("input-name").value || "Player 1").trim() || "Player 1";
        G.myName = name;
        try { await G.api.ensurePlayer(name); } catch (e) {}

        if (join && G.joinCode) {
            G.online = true; G.mode = "ONLINE"; G.variant = cfg.variant; G.joining = true;
            try {
                await G.api.connectWs();
                G.api.subscribeRoom(G.joinCode, onWs);
                G.code = G.joinCode;
                G.api.sendRoom(G.joinCode, "JOIN", name);
                toast("Joined room " + G.joinCode);
                $("setup-modal").classList.add("hidden");
            } catch (e) {
                toast("Join error: " + e.message);
                $("setup-modal").classList.remove("hidden");
                G.joining = false;
            }
            return;
        }

        // Vs AI / Local run fully client-side (no backend required).
        if (cfg.mode !== "ONLINE") {
            G.online = false; G.local = true; G.code = "LOCAL";
            G.mode = cfg.mode; G.variant = cfg.variant; G.built = false;
            const players = (cfg.mode === "VS_AI")
                ? [{ name, ai: false, difficulty: cfg.difficulty, color: PALETTE[0] },
                   { name: "Bot", ai: true, difficulty: cfg.difficulty, color: PALETTE[1] }]
                : cfg.localNames.map((n, i) => ({ name: n, ai: false, color: PALETTE[i % PALETTE.length] }));
            G.engine = new LocalEngine();
            const st = G.engine.create({ mode: cfg.mode, variant: cfg.variant, difficulty: cfg.difficulty, players });
            $("setup-modal").classList.add("hidden");
            applyState(st, false);
            scheduleNext(st);
            return;
        }

        const req = { mode: cfg.mode, variant: cfg.variant, difficulty: cfg.difficulty, players: [] };
        if (cfg.mode === "VS_AI") {
            req.players = [
                { name, ai: false, difficulty: cfg.difficulty, color: PALETTE[0] },
                { name: "Bot", ai: true, difficulty: cfg.difficulty, color: PALETTE[1] }
            ];
        } else if (cfg.mode === "LOCAL") {
            req.players = cfg.localNames.map((n, i) => ({ name: n, ai: false, color: PALETTE[i % PALETTE.length] }));
        } else { // ONLINE create (host + bots so it is playable solo too)
            req.hostUsername = name;
            req.players = [{ name, ai: false, color: PALETTE[0] }];
            req.players.push({ name: "Bot", ai: true, difficulty: cfg.difficulty, color: PALETTE[1] });
        }

        try {
            const st = await G.api.createGame(req);
            G.code = st.roomCode; G.mode = cfg.mode; G.variant = cfg.variant;
            $("setup-modal").classList.add("hidden");
            if (cfg.mode === "ONLINE") {
                G.online = true;
                try {
                    await G.api.connectWs();
                    G.api.subscribeRoom(G.code, onWs);
                    toast("Room " + st.roomCode + " — share the code!");
                } catch (e) { toast("WS unavailable, playing via REST"); G.online = false; }
                applyState(st, false);
            } else {
                G.online = false;
                applyState(st, false);
                scheduleNext(st);
            }
        } catch (e) {
            $("setup-error").textContent = e.message;
        }
    }

    /* ---------------- setup modal UI ---------------- */
    function setupModalWiring() {
        const seg = (id, key, cast) => {
            $(id).querySelectorAll("button").forEach(b => {
                b.onclick = () => {
                    $(id).querySelectorAll("button").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    G.config[key] = cast ? cast(b.dataset[Object.keys(b.dataset)[0]]) : b.dataset[Object.keys(b.dataset)[0]];
                    refreshSetupFields();
                };
            });
        };
        seg("seg-mode", "mode");
        seg("seg-variant", "variant");
        seg("seg-difficulty", "difficulty");

        $("input-name").oninput = e => G.config.name = e.target.value;
        $("input-local-count").oninput = e => {
            G.config.localCount = +e.target.value;
            $("local-count-label").textContent = e.target.value;
            renderLocalNames();
        };
        $("btn-join-room").onclick = () => {
            const v = ($("input-room").value || "").trim().toUpperCase();
            if (!v) { $("setup-error").textContent = "Enter a room code to join."; return; }
            G.joinCode = v; startGame(true);
        };
        $("btn-start").onclick = () => { $("setup-error").textContent = ""; startGame(false); };
        $("btn-play-again").onclick = () => window.location.reload();

        // leaderboard tabs
        $("leaderboard-panel").querySelectorAll(".lb-tabs button").forEach(b => {
            b.onclick = () => {
                $("leaderboard-panel").querySelectorAll(".lb-tabs button").forEach(x => x.classList.remove("active"));
                b.classList.add("active");
                loadLeaderboard(b.dataset.by);
            };
        });

        $("btn-sound").onclick = () => {
            G.soundOn = !G.soundOn;
            $("btn-sound").textContent = G.soundOn ? "🔊" : "🔇";
            if (G.soundOn) ensureAudio();
        };
        $("btn-new").onclick = () => { $("setup-modal").classList.remove("hidden"); };

        refreshSetupFields();
        renderLocalNames();
    }

    function refreshSetupFields() {
        const m = G.config.mode;
        $("field-difficulty").classList.toggle("hidden", m === "LOCAL");
        $("field-local-count").classList.toggle("hidden", m !== "LOCAL");
        $("field-room").classList.toggle("hidden", m !== "ONLINE");
        $("field-variant").classList.toggle("hidden", false);
    }

    function renderLocalNames() {
        const wrap = $("local-names"); wrap.innerHTML = "";
        const n = G.config.localCount;
        const first = ($("input-name").value || "Player 1").trim() || "Player 1";
        G.config.localNames = [];
        for (let i = 0; i < n; i++) {
            const def = i === 0 ? first : "Player " + (i + 1);
            G.config.localNames.push(def);
            const row = document.createElement("div"); row.className = "local-name-row";
            const dot = document.createElement("span"); dot.style.background = PALETTE[i % PALETTE.length];
            const inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 14; inp.value = def;
            inp.oninput = e => { G.config.localNames[i] = e.target.value; };
            row.appendChild(dot); row.appendChild(inp); wrap.appendChild(row);
        }
    }

    /* ---------------- camera drag / zoom ---------------- */
    function cameraWiring() {
        const scene = $("scene"); const wrap = $("board-wrap");
        let dragging = false, lx = 0, ly = 0;
        scene.addEventListener("pointerdown", e => {
            if (e.target.closest(".glass, button, input, .overlay, .token")) return;
            dragging = true; lx = e.clientX; ly = e.clientY; wrap.classList.add("dragging");
            scene.setPointerCapture(e.pointerId);
        });
        scene.addEventListener("pointermove", e => {
            if (!dragging) return;
            const dx = e.clientX - lx, dy = e.clientY - ly;
            lx = e.clientX; ly = e.clientY;
            G.board.setCamera(G.board.tiltX - dy * 0.3, G.board.tiltY + dx * 0.4);
        });
        const end = () => { dragging = false; wrap.classList.remove("dragging"); };
        scene.addEventListener("pointerup", end);
        scene.addEventListener("pointercancel", end);
        scene.addEventListener("wheel", e => {
            e.preventDefault();
            G.board.setCamera(null, null, G.board.zoom * (1 - e.deltaY * 0.0012));
        }, { passive: false });
    }

    function resizeWiring() {
        let t = null;
        window.addEventListener("resize", () => {
            clearTimeout(t);
            t = setTimeout(() => {
                if (G.lastState) {
                    if (!G.busy) {
                        G.board.build(G.lastState);
                    } else {
                        t = setTimeout(() => { if (G.lastState) G.board.build(G.lastState); }, 400);
                    }
                }
            }, 250);
        });
    }

    /* ---------------- init ---------------- */
    window.addEventListener("DOMContentLoaded", () => {
        G.board = new Board3D($("board"));
        G.dice = new Dice($("dice"));
        setupModalWiring();
        cameraWiring();
        resizeWiring();
        loadLeaderboard("winrate");
        $("btn-roll").onclick = () => doRoll(G.lastState ? G.lastState.currentPlayerName : null);
        const startBtn = $("btn-start-online");
        if (startBtn) {
            startBtn.onclick = () => {
                if (G.code && G.online) {
                    G.api.sendRoom(G.code, "START", G.myName);
                    toast("Game started!");
                }
            };
        }
        // sensible default camera
        G.board.setCamera(58, 0, 1);
    });
})();
