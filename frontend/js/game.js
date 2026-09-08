/* ============================================================
   game.js — controller: local setup, 3D board, dice, HUD, audio
   ============================================================ */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const PALETTE = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"];

    const G = {
        api: new Api(),
        board: null, dice: null,
        mode: null, variant: null,
        busy: false, lastState: null,
        built: false, builtCode: null, builtSize: 0,
        soundOn: true, audio: null,
        config: { variant: "CLASSIC", localCount: 2, localNames: [] },
        engine: null, stateQueue: null
    };
    let stateQueue = null;

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
            saveLocalResult(st);
            onWin(st);
            return;
        }
        scheduleNext(st);
    }

    function scheduleNext(st) {
        if (st.status !== "PLAYING") {
            setRollLabel(st.status === "WAITING" ? "Waiting…" : "Finished", false);
            return;
        }
        const cur = st.players.find(p => p.name === st.currentPlayerName);
        if (!cur) return;
        if (cur.ai) {
            setRollLabel("🤖 " + cur.name + "…", false);
            const expected = cur.name;
            const tryRoll = () => {
                if (!G.busy && G.lastState && G.lastState.currentPlayerName === expected) {
                    doRoll(expected);
                } else {
                    setTimeout(tryRoll, 200);
                }
            };
            setTimeout(tryRoll, 600);
            return;
        }
        setRollLabel("🎲 " + cur.name + ", roll!", true);
        renderPowerups(st, cur);
    }

    /* ---------------- actions ---------------- */
    function doRoll(player) {
        if (G.busy || !G.code) return;
        setRollLabel("Rolling…", false);
        sound("roll");
        const st = G.engine.roll(player);
        applyState(st, true);
    }

    function usePowerup(type) {
        if (G.busy || !G.code) return;
        const st = G.lastState; if (!st) return;
        const cur = st.players.find(p => p.name === st.currentPlayerName);
        if (!cur) return;
        const target = currentLeader(st, cur);
        setRollLabel("Using…", false);
        const s = G.engine.usePowerUp(cur.name, type, target ? target.name : null);
        applyState(s, false);
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
        $("mode-label").textContent = st.mode + (st.difficulty ? " · " + st.difficulty : "");
        $("room-code").textContent = st.roomCode || "—";
        $("turn-count").textContent = st.turnCount;
        $("variant-label").textContent = st.variant;
        G.dice.snap(st.dice || 1);

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

        const log = $("log-list"); log.innerHTML = "";
        (st.log || []).slice(-40).forEach(line => {
            const li = document.createElement("li"); li.textContent = line; log.appendChild(li);
        });
        log.scrollTop = log.scrollHeight;
    }

    function renderPowerups(st, cur) {
        const wrap = $("powerups"); wrap.innerHTML = "";
        if (!cur || cur.ai) return;
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
        renderLocalLeaderboard(by);
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

    /* ---------------- start game ---------------- */
    async function startGame() {
        ensureAudio();
        const cfg = G.config;
        const names = cfg.localNames.filter(n => n && n.trim());
        if (names.length < 2) { toast("Need at least 2 players"); return; }
        for (const n of names) { try { await G.api.ensurePlayer(n); } catch (e) {} }

        G.mode = "LOCAL"; G.variant = cfg.variant; G.built = false;
        const players = names.map((n, i) => ({ name: n, ai: false, color: PALETTE[i % PALETTE.length] }));
        G.engine = new LocalEngine();
        const st = G.engine.create({ mode: "LOCAL", variant: cfg.variant, difficulty: "EASY", players });
        $("setup-modal").classList.add("hidden");
        applyState(st, false);
        scheduleNext(st);
    }

    /* ---------------- setup modal UI ---------------- */
    function setupModalWiring() {
        const seg = (id, key) => {
            $(id).querySelectorAll("button").forEach(b => {
                b.onclick = () => {
                    $(id).querySelectorAll("button").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    G.config[key] = b.dataset[key.split("-")[0]] || b.dataset.variant || b.dataset.diff;
                };
            });
        };
        seg("seg-variant", "variant");

        $("input-local-count").oninput = e => {
            G.config.localCount = +e.target.value;
            $("local-count-label").textContent = e.target.value;
            renderLocalNames();
        };
        $("btn-start").onclick = () => { $("setup-error").textContent = ""; startGame(); };
        $("btn-play-again").onclick = () => window.location.reload();

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

        renderLocalNames();
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
                        t = setTimeout(() => { if (G.lastState) G.board.build(G.lastState); }, 1500);
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
        G.board.setCamera(58, 0, 1);
    });
})();
