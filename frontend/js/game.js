/* ============================================================
   game.js — controller: local setup, 3D board, dice, HUD, audio
   ============================================================ */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const PALETTE = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"];

    const VARIANT_DESCS = {
        CLASSIC: "Classic board with standard snakes and ladders.",
        POWERUP: "Classic board plus collectible power-ups: Shield, Double Roll, Freeze.",
        CHAOS: "The board reshuffles every 3 turns. Adapt or lose!",
        SPEED: "50-tile sprint with dense ladders for faster matches."
    };

    const G = {
        api: new Api(),
        board: null, dice: null,
        mode: null, variant: null,
        busy: false, lastState: null,
        built: false, builtCode: null, builtSize: 0,
        soundOn: true, audio: null,
        config: { variant: "CLASSIC", difficulty: "EASY", localCount: 2, localNames: [], mode: "LOCAL" },
        engine: null, stateQueue: null,
        local: false, // true only for LOCAL multiplayer (keyboard roll mapping applies)
        online: false, // true only for ONLINE (server-authoritative) mode
        // riddle state
        riddle: { active: false, resolve: null, reject: null, timer: null, timeLeft: 15, currentRiddle: null, slideEvent: null },
        // background music state
        bgMusic: { node: null, gain: null, playing: false },
        // online mode state
        ws: null, roomCode: null, onlinePlayers: [], isHost: false
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

    /* ---------------- retro background music ---------------- */
    function createRetroMusic() {
        if (!G.audio) return null;
        const ctx = G.audio;
        const gain = ctx.createGain();
        gain.gain.value = 0.2;
        gain.connect(ctx.destination);

        // Simple chiptune-style loop: arpeggio + bass
        const notes = [
            // Arpeggio pattern (higher notes)
            { freq: 261.63, dur: 0.15, type: "square", vol: 0.03 }, // C4
            { freq: 329.63, dur: 0.15, type: "square", vol: 0.03 }, // E4
            { freq: 392.00, dur: 0.15, type: "square", vol: 0.03 }, // G4
            { freq: 523.25, dur: 0.15, type: "square", vol: 0.03 }, // C5
            { freq: 392.00, dur: 0.15, type: "square", vol: 0.03 }, // G4
            { freq: 329.63, dur: 0.15, type: "square", vol: 0.03 }, // E4
            // Bass line
            { freq: 65.41, dur: 0.3, type: "sawtooth", vol: 0.04 },  // C2
            { freq: 87.31, dur: 0.3, type: "sawtooth", vol: 0.04 },  // F2
            { freq: 98.00, dur: 0.3, type: "sawtooth", vol: 0.04 },  // G2
            { freq: 87.31, dur: 0.3, type: "sawtooth", vol: 0.04 },  // F2
        ];

        let noteIndex = 0;
        let nextTime = ctx.currentTime;

        function scheduleNext() {
            if (!G.bgMusic.playing || !G.soundOn) return;
            const note = notes[noteIndex % notes.length];
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = note.type;
            o.frequency.value = note.freq;
            g.gain.value = note.vol;
            o.connect(g);
            g.connect(gain);
            const startTime = Math.max(nextTime, ctx.currentTime);
            o.start(startTime);
            g.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur);
            o.stop(startTime + note.dur);
            nextTime = startTime + note.dur;
            noteIndex++;
            // Schedule next note
            const delay = (nextTime - ctx.currentTime) * 1000;
            setTimeout(scheduleNext, Math.max(1, delay));
        }

        G.bgMusic.gain = gain;
        G.bgMusic.playing = true;
        scheduleNext();
        return gain;
    }

    function startBgMusic() {
        if (G.bgMusic.playing) return;
        // Try HTML audio element first (file-based)
        const audioEl = $("bg-music");
        const source = audioEl && audioEl.querySelector("source[src]");
        if (source) {
            audioEl.volume = 0.2;
            audioEl.play().catch((e) => {
                console.error("[bg-music] HTML audio play failed:", e);
                // Fallback to procedural if file fails
                ensureAudio();
                if (G.audio) createRetroMusic();
            });
            G.bgMusic.node = audioEl;
            G.bgMusic.playing = true;
            return;
        }
        // Fallback to procedural
        ensureAudio();
        if (!G.audio) return;
        if (G.audio.state === "suspended") {
            G.audio.resume().then(() => createRetroMusic());
        } else {
            createRetroMusic();
        }
    }

    function stopBgMusic() {
        G.bgMusic.playing = false;
        const audioEl = $("bg-music");
        if (audioEl) {
            audioEl.pause();
            audioEl.currentTime = 0;
        }
        if (G.bgMusic.gain) {
            G.bgMusic.gain.disconnect();
            G.bgMusic.gain = null;
        }
    }

    function toggleBgMusic(on) {
        if (on) startBgMusic(); else stopBgMusic();
    }

    /* ---------------- riddle handling ---------------- */
    function fetchRiddle() {
        if (G.mode === "LOCAL") return Promise.resolve(Riddles.pickRandom());
        return G.api.riddle().catch(() => Riddles.pickRandom());
    }

    function showRiddleModal(riddle) {
        const overlay = $("riddle-overlay");
        const questionEl = $("riddle-question");
        const choicesEl = $("riddle-choices");
        const inputEl = $("riddle-input");
        const timerEl = $("riddle-timer");
        const feedbackEl = $("riddle-feedback");
        const submitBtn = $("riddle-submit");

        questionEl.innerHTML = "";
        riddle.question.split("\n").forEach(line => {
            const lineDiv = document.createElement("div");
            lineDiv.className = "riddle-line";
            lineDiv.textContent = line;
            questionEl.appendChild(lineDiv);
        });
        choicesEl.innerHTML = "";
        inputEl.classList.add("hidden");
        feedbackEl.classList.add("hidden");
        feedbackEl.textContent = "";
        feedbackEl.className = "riddle-feedback hidden";

        if (riddle.choices && riddle.choices.length > 0) {
            riddle.choices.forEach(choice => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "riddle-choice-btn";
                btn.textContent = choice;
                btn.onclick = () => {
                    document.querySelectorAll(".riddle-choice-btn").forEach(b => b.classList.remove("selected"));
                    btn.classList.add("selected");
                    inputEl.value = choice;
                };
                choicesEl.appendChild(btn);
            });
        } else {
            inputEl.classList.remove("hidden");
            inputEl.value = "";
        }

        // Position-based timer: 20s normally, 12s past tile 55
        const slideEvent = G.riddle.slideEvent;
        const snakeHeadTile = slideEvent ? slideEvent.path[slideEvent.path.length - 1] : 0;
        const seconds = snakeHeadTile > 55 ? 12 : 20;
        G.riddle.timeLeft = seconds;
        timerEl.textContent = G.riddle.timeLeft;

        overlay.classList.remove("hidden");

        if (G.riddle.timer) clearInterval(G.riddle.timer);
        G.riddle.timer = setInterval(() => {
            G.riddle.timeLeft--;
            timerEl.textContent = G.riddle.timeLeft;
            if (G.riddle.timeLeft <= 0) {
                clearInterval(G.riddle.timer);
                G.riddle.timer = null;
                handleRiddleAnswer(false, "Time's up!");
            }
        }, 1000);

        submitBtn.onclick = () => {
            const answer = inputEl.value.trim();
            if (!answer) {
                feedbackEl.textContent = "Please enter an answer";
                feedbackEl.className = "riddle-feedback hidden";
                feedbackEl.classList.remove("hidden");
                return;
            }
            handleRiddleAnswer(answer.toLowerCase() === riddle.answer.toLowerCase(), answer);
        };
    }

    function hideRiddleModal() {
        const overlay = $("riddle-overlay");
        overlay.classList.add("hidden");
        if (G.riddle.timer) {
            clearInterval(G.riddle.timer);
            G.riddle.timer = null;
        }
    }

    function handleRiddleAnswer(correct, userAnswer) {
        const feedbackEl = $("riddle-feedback");
        if (correct) {
            feedbackEl.textContent = "✓ Correct! You dodged the snake!";
            feedbackEl.className = "riddle-feedback success";
        } else {
            feedbackEl.textContent = "✗ Wrong! The answer was: " + G.riddle.currentRiddle.answer + ". Sliding down...";
            feedbackEl.className = "riddle-feedback error";
        }
        feedbackEl.classList.remove("hidden");

        if (G.riddle.timer) {
            clearInterval(G.riddle.timer);
            G.riddle.timer = null;
        }

        const slideEvent = G.riddle.slideEvent;
        const playerName = slideEvent.player;
        const from = slideEvent.from;
        const snakeHead = slideEvent.path[slideEvent.path.length - 1];
        const snakeTail = slideEvent.to;

        setTimeout(() => {
            hideRiddleModal();
            if (correct) {
                G.lastState.players.forEach(p => {
                    if (p.name === playerName) p.position = snakeHead;
                });
                G.lastState.log.push(playerName + " solved a riddle and dodged the snake!");
                G.board.moveAlong(playerName, slideEvent.path, snakeHead, "CLIMB", () => afterMove(G.lastState));
                return;
            } else {
                G.board.moveAlong(playerName, slideEvent.path, snakeTail, "SLIDE", () => afterMove(G.lastState));
                return;
            }
        }, 1200);
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
    async function applyState(st, animate) {
        G.lastState = st;
        ensureBuild(st);
        if (animate && st.lastEvent) {
            if (G.busy) {
                stateQueue = { st, animate };
                return;
            }
            if (st.lastEvent.kind === "SLIDE") {
                G.busy = true;
                setRollLabel("Rolling…", false);
                sound("snake");
                G.dice.roll(st.dice, async () => {
                    const slideEvent = st.lastEvent;
                    const riddle = await fetchRiddle();
                    G.riddle.currentRiddle = riddle;
                    G.riddle.slideEvent = slideEvent;
                    showRiddleModal(riddle);
                });
                return;
            }
            G.busy = true;
            setRollLabel("Rolling…", false);
            if (st.lastEvent.kind === "CLIMB") sound("ladder");
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
        console.log("[TRACE] afterMove called, status=" + st.status + " cur=" + st.currentPlayerName);
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
        // ONLINE: the server is authoritative and drives AI turns itself.
        // Never auto-roll client-side in online mode — that would race the server.
        if (G.online) {
            setRollLabel("🎲 " + cur.name + ", roll!", true);
            renderPowerups(st, cur);
            return;
        }
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
        // ONLINE mode: server-authoritative — every client (host & joiner) sends
        // ROLL to the backend, which computes the turn and broadcasts the STATE.
        if (G.online) {
            setRollLabel("Rolling…", false);
            sound("roll");
            const name = (typeof player === "string") ? player
                : (G.lastState ? G.lastState.currentPlayerName : null);
            G.api.sendRoom(G.code, "ROLL", name, null);
            return;
        }
        setRollLabel("Rolling…", false);
        sound("roll");
        const st = G.engine.roll(player);
        applyState(st, true);
    }

    /* ---------------- keyboard roll mapping (local multiplayer) ---------------- */
    const ROLL_KEY_MAP_STORAGE = "rollKeyMap";
    const DEFAULT_ROLL_KEY_MAP = {
        "Space": "Player 1",
        "Enter": "Player 2",
        "Digit1": "Player 1",
        "Digit2": "Player 2"
    };

    /** Load the admin-configurable key->player mapping from localStorage. */
    function loadRollKeyMap() {
        try {
            const raw = localStorage.getItem(ROLL_KEY_MAP_STORAGE);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") return parsed;
            }
        } catch (e) { /* ignore corrupt storage */ }
        return Object.assign({}, DEFAULT_ROLL_KEY_MAP);
    }

    /** Check whether the focused element is a text input/textarea/select (typing should not roll). */
    function isTypingContext(activeEl) {
        if (!activeEl) return false;
        const tag = (activeEl.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") {
            // Only block on text-like inputs; buttons are fine to trigger
            const type = (activeEl.getAttribute("type") || "").toLowerCase();
            if (tag === "input" && (type === "text" || type === "password" || type === "email" || type === "search" || type === "number" || type === "tel" || type === "url")) {
                return true;
            }
            if (tag === "textarea" || tag === "select") return true;
            // For other input types (checkbox/range/etc.) also block to be safe
            if (tag === "input") return true;
        }
        if (activeEl.isContentEditable === "true") return true;
        return false;
    }

    /**
     * Document-level keydown handler for admin-assigned keyboard roll controls.
     * Only active in LOCAL mode, only on the mapped player's turn, and only when
     * the game is not busy and focus is not in a text input.
     */
    function onRollKeyDown(e) {
        // Ignore if focus is in a text-like input (typing should not roll)
        if (isTypingContext(document.activeElement)) return;

        // Keyboard rolling is only for LOCAL multiplayer
        if (G.mode !== "LOCAL" || !G.local) return;
        if (G.busy) return;
        if (!G.lastState) return;

        const keyMap = loadRollKeyMap();
        // Map both key and code so admin-assigned keys work regardless of layout
        const mappedPlayer = keyMap[e.key] || keyMap[e.code];
        if (!mappedPlayer) return;

        // Only roll if it is currently this player's turn
        if (G.lastState.currentPlayerName !== mappedPlayer) return;

        // Prevent default so e.g. Space/Enter don't scroll or submit forms
        e.preventDefault();
        doRoll(mappedPlayer);
    }

    /** Register the document-level keydown listener (once). */
    function enableKeyboardRolling() {
        document.addEventListener("keydown", onRollKeyDown, true); // capture phase for priority
    }

    function usePowerup(type) {
        if (G.busy || !G.code) return;
        const st = G.lastState; if (!st) return;
        const cur = st.players.find(p => p.name === st.currentPlayerName);
        if (!cur) return;
        const target = currentLeader(st, cur);
        // ONLINE mode: server-authoritative — every client sends USE_POWERUP to the
        // backend, which applies it and broadcasts the resulting STATE.
        if (G.online) {
            setRollLabel("Using…", false);
            const targetName = target ? target.name : null;
            G.api.sendRoom(G.code, "USE_POWERUP", cur.name, { type: type, target: targetName });
            return;
        }
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
        $("room-code").textContent = G.roomCode || st.roomCode || "—";
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
        // Fetch from API with "me" parameter to include current player
        G.api.leaderboard(by, 10, G.myName).then(data => renderLeaderboard(data, by)).catch(() => renderLocalLeaderboard(by));
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
        G.api.recordMatch(st.winner, st.mode, st.variant, true, st.turnCount, 1).catch(() => {});
    }
    function renderLeaderboard(entries, by) {
        const ol = $("leaderboard-list"); ol.innerHTML = "";
        let meEntry = null;
        // Separate the "me" entry if it's outside top 10 (rank > 10 or no rank assigned)
        const topEntries = entries.filter(e => e.rank > 0 && e.rank <= 10);
        const otherEntries = entries.filter(e => !(e.rank > 0 && e.rank <= 10));
        if (otherEntries.length > 0) {
            meEntry = otherEntries[0]; // Should be the "me" entry
        }
        // Render top entries
        topEntries.forEach(e => {
            const li = document.createElement("li");
            const meta = by === "fastest" ? (e.fastestWinTurns != null ? e.fastestWinTurns + " turns" : "—")
                : by === "wins" ? (e.totalWins + " wins") : Math.round((e.winRate || 0) * 100) + "% · " + e.totalWins + "W";
            li.innerHTML = "<span class='lb-rank'>#" + e.rank + "</span><b>" + e.username + "</b> <span class='lb-meta'>" + meta + "</span>";
            if (G.myName && e.username === G.myName) {
                li.classList.add("is-me");
            }
            ol.appendChild(li);
        });
        // Render "me" entry if outside top 10
        if (meEntry) {
            const divider = document.createElement("li");
            divider.className = "lb-divider";
            divider.textContent = "…";
            ol.appendChild(divider);
            const li = document.createElement("li");
            const meta = by === "fastest" ? (meEntry.fastestWinTurns != null ? meEntry.fastestWinTurns + " turns" : "—")
                : by === "wins" ? (meEntry.totalWins + " wins") : Math.round((meEntry.winRate || 0) * 100) + "% · " + meEntry.totalWins + "W";
            li.innerHTML = "<span class='lb-rank'>#" + meEntry.rank + "</span><b>" + meEntry.username + "</b> <span class='lb-meta'>" + meta + "</span>";
            li.classList.add("is-me");
            ol.appendChild(li);
        }
    }
    function renderLocalLeaderboard(by) {
        const lb = loadLocalLeaderboard();
        let sorted = lb.slice();
        if (by === "wins") sorted.sort((a, b) => b.totalWins - a.totalWins || a.totalGames - b.totalGames);
        else if (by === "fastest") sorted.sort((a, b) => (a.fastestWinTurns || 1e9) - (b.fastestWinTurns || 1e9));
        else sorted.sort((a, b) => (b.totalWins / (b.totalGames || 1)) - (a.totalWins / (a.totalGames || 1)));
        const ol = $("leaderboard-list"); ol.innerHTML = "";
        sorted.slice(0, 10).forEach((e, i) => {
            const li = document.createElement("li");
            const meta = by === "fastest" ? (e.fastestWinTurns != null ? e.fastestWinTurns + " turns" : "—")
                : by === "wins" ? (e.totalWins + " wins") : Math.round((e.totalWins / (e.totalGames || 1)) * 100) + "% · " + e.totalWins + "W";
            li.innerHTML = "<span class='lb-rank'>#" + (i + 1) + "</span><b>" + e.username + "</b> <span class='lb-meta'>" + meta + "</span>";
            if (G.myName && e.username === G.myName) {
                li.classList.add("is-me");
            }
            ol.appendChild(li);
        });
    }

    /* ---------------- start game ---------------- */
    async function startGame() {
        ensureAudio();
        const cfg = G.config;
        const selected = collectSelectedNames();

        const mode = G.config.mode || "LOCAL";
        if (mode === "ONLINE") {
            if (selected.length < 1) { toast("Enter your name"); return; }
            await startOnlineGame(cfg, selected);
            return;
        }

        if (selected.length < 2) { toast("Select at least 2 players"); return; }
        if (G.soundOn) startBgMusic();
        for (const n of selected) { try { await G.api.ensurePlayer(n); } catch (e) {} }

        G.mode = "LOCAL"; G.variant = cfg.variant; G.built = false; G.code = "LOCAL";
        G.local = true;
        G.myName = selected[0]; // Track the first player as "me"
        const players = selected.map((n, i) => ({ name: n, ai: (mode === "VS_AI" && i > 0), color: PALETTE[i % PALETTE.length] }));
        G.engine = new LocalEngine();
        const st = G.engine.create({ mode: "LOCAL", variant: cfg.variant, difficulty: cfg.difficulty || "EASY", players });
        $("setup-modal").classList.add("hidden");
        applyState(st, false);
        scheduleNext(st);
    }

    /* ---------------- online mode ---------------- */
    async function startOnlineGame(cfg, selected) {
        const roomInput = $("input-room");
        const roomCode = roomInput ? roomInput.value.trim().toUpperCase() : "";
        if (roomCode && /^\d{6}$/.test(roomCode)) {
            await joinOnlineRoom(roomCode, selected);
        } else {
            await createOnlineRoom(selected);
        }
    }

    async function createOnlineRoom(selected) {
        G.myName = selected[0];
        try {
            const resp = await G.api.createRoom(G.myName, "ONLINE", G.config.variant);
            G.roomCode = resp.roomCode;
        } catch (e) {
            G.roomCode = Math.floor(100000 + Math.random() * 900000).toString();
        }
        G.mode = "ONLINE"; G.variant = G.config.variant; G.built = false;
        G.isHost = true;
        G.code = G.roomCode;
        G.local = false;
        G.online = true;
        G.engine = null; // ONLINE is server-authoritative; no client-side engine
        $("setup-modal").classList.add("hidden");
        showQrPanel(G.roomCode);
        toast("Room " + G.roomCode + " - share the code!");
        $("mode-label").textContent = "Online · Room " + G.roomCode + " · Waiting to start";
        await G.api.connectWs();
        G.api.subscribeRoom(G.code, onWs);
        // Wire up reconnect re-sync: when WebSocket reconnects, _syncStates fetches
        // the room state via REST and invokes this callback to apply it.
        G.api.setOnSync(st => applyState(st, false));
        // Host's Start button triggers the authoritative session via REST. The
        // backend (createAndStartSession) builds the board and broadcasts the
        // initial STATE, which this client renders through onWs.
        const startBtn = $("btn-start-online");
        if (startBtn) {
            startBtn.classList.remove("hidden");
            startBtn.onclick = () => {
                G.api.start(G.code, G.myName);
                toast("Starting game…");
            };
        }
    }

    /**
     * WebSocket message handler for inbound broadcasts from /topic/room/{code}.
     * The backend is authoritative: it runs GameSession and broadcasts a single
     * WebSocketOutMessage envelope ({ type: STATE|ERROR|INFO, roomCode, state, message })
     * per event. The client is a thin viewer — it never recomputes game state and
     * never sends STATE itself; all actions (ROLL/USE_POWERUP/JOIN/START) go to the
     * server, which drives the game and broadcasts the resulting snapshot.
     */
    function onWs(data) {
        if (!data) return;
        const type = (data.type || "").toString().toUpperCase();
        if (type === "STATE") {
            // Authoritative snapshot from the server — render it without animating.
            const st = data.state || data;
            if (st) applyState(st, false);
        } else if (type === "ERROR") {
            toast("Server error: " + (data.message || "unknown"));
        } else if (type === "INFO") {
            // Informational broadcast (e.g. chat) — no UI action required.
        }
    }

    async function joinOnlineRoom(roomCode, selected) {
        G.myName = selected[0];
        try {
            await G.api.joinRoom(roomCode, G.myName);
        } catch (e) {
            toast("Could not join room: " + e.message);
            return;
        }
        G.roomCode = roomCode;
        G.mode = "ONLINE"; G.variant = G.config.variant; G.built = false;
        G.isHost = false;
        G.code = roomCode;
        G.local = false;
        G.online = true;
        G.engine = null; // ONLINE is server-authoritative; no client-side engine
        $("setup-modal").classList.add("hidden");
        $("mode-label").textContent = "Online · Room " + roomCode;
        await G.api.connectWs();
        G.api.subscribeRoom(roomCode, onWs);
        // Wire up reconnect re-sync for joiners as well.
        G.api.setOnSync(st => applyState(st, false));
        // Best-effort REST re-sync of room metadata (tolerant of no live session yet).
        // The authoritative game state is delivered via WebSocket STATE broadcasts.
        try {
            const info = await G.api.syncRoom(roomCode);
            if (info && info.variant) G.variant = info.variant;
        } catch (e) { /* ignore — rely on WS state */ }
        // Tell the server we joined; it replies with the current snapshot as STATE.
        G.api.sendRoom(roomCode, "JOIN", G.myName, { ai: false });
        toast("Joined room " + roomCode);
    }

    function showQrPanel(roomCode) {
        const overlay = $("qr-overlay");
        const qrDiv = $("qr-code");
        const codeDiv = $("qr-room-code");
        if (!overlay || !qrDiv) return;
        codeDiv.textContent = roomCode;
        qrDiv.innerHTML = "";
        const hostInput = $("input-host");
        const savedHost = localStorage.getItem("sl3d_host") || window.location.host;
        hostInput.value = savedHost;
        hostInput.onchange = function () {
            localStorage.setItem("sl3d_host", hostInput.value);
            updateQrCode(roomCode, hostInput.value);
        };
        updateQrCode(roomCode, hostInput.value);
        overlay.classList.remove("hidden");
    }

    function updateQrCode(roomCode, host) {
        const qrDiv = $("qr-code");
        if (!qrDiv) return;
        qrDiv.innerHTML = "";
        const url = location.protocol + "//" + host + "/?room=" + roomCode;
        if (typeof QRCode !== "undefined") {
            try {
                QRCode.toCanvas(qrDiv, url, { width: 200, margin: 2 }, function () {});
            } catch (e) {
                qrDiv.innerHTML = '<div class="hint" style="color:var(--bad);">QR generation failed</div>';
            }
        } else {
            qrDiv.innerHTML = '<span class="hint">QR: ' + url + '</span>';
        }
    }

    function updateModeDesc() {
        const desc = $("mode-desc");
        if (!desc) return;
        if (G.config.mode === "ONLINE") {
            desc.textContent = "Play online with friends. Connect via room code or QR.";
        } else if (G.config.mode === "VS_AI") {
            desc.textContent = "Play against computer opponent.";
        } else {
            desc.textContent = "Local multiplayer on one device.";
        }
    }

    function updateRoomFieldVisibility() {
        const field = $("field-room");
        if (!field) return;
        if (G.config.mode === "ONLINE") field.classList.remove("hidden");
        else field.classList.add("hidden");
    }

    /* Select a mode programmatically, keeping #seg-mode and the config in sync. */
    function selectSetupMode(mode) {
        const seg = $("seg-mode");
        if (seg) {
            seg.querySelectorAll("button").forEach(b => {
                const on = b.dataset.mode === mode;
                b.classList.toggle("active", on);
                b.setAttribute("aria-checked", on ? "true" : "false");
            });
        }
        G.config.mode = mode;
        updateModeDesc();
        refreshSetupFields();
    }

    function refreshSetupFields() {
        const mode = G.config.mode;
        const diffField = $("field-difficulty");
        const localField = $("field-local-count");
        const roomField = $("field-room");
        const playerField = $("field-player");

        if (diffField) {
            if (mode === "VS_AI") diffField.classList.remove("hidden");
            else diffField.classList.add("hidden");
        }
        if (localField) {
            if (mode === "LOCAL") localField.classList.remove("hidden");
            else localField.classList.add("hidden");
        }
        if (roomField) {
            if (mode === "ONLINE") roomField.classList.remove("hidden");
            else roomField.classList.add("hidden");
        }
        if (playerField) {
            playerField.classList.remove("hidden");
        }
        renderLocalNames();
    }

    function renderLocalNames() {
        const container = $("local-names");
        const countInput = $("input-local-count");
        const label = $("local-count-label");
        const valueOut = $("local-count-value");
        if (!container || !countInput) return;

        const count = parseInt(countInput.value, 10) || 2;
        if (label) label.textContent = "Number of Players";
        if (valueOut) valueOut.textContent = count;

        const currentInputs = container.querySelectorAll("input");
        const currentNames = Array.from(currentInputs).map(i => i.value.trim());

        container.innerHTML = "";
        for (let i = 0; i < count; i++) {
            const input = document.createElement("input");
            input.type = "text";
            input.maxLength = 18;
            input.placeholder = `Player ${i + 1} name`;
            input.autocomplete = "off";
            input.value = currentNames[i] || (i === 0 ? ($("input-name")?.value?.trim() || "") : "");
            container.appendChild(input);
        }
    }

    function collectSelectedNames() {
        const mode = G.config.mode;
        const names = [];

        const nameInput = $("input-name");
        const rawName = nameInput ? nameInput.value.trim() : "";
        const myName = rawName || "Player 1";
        if (!rawName && nameInput) nameInput.focus();
        names.push(myName);

        if (mode === "LOCAL") {
            const inputs = $("local-names")?.querySelectorAll("input");
            if (inputs) {
                inputs.forEach((input, idx) => {
                    if (idx === 0) return; // skip first, already added from myName
                    const val = input.value.trim();
                    if (val) names.push(val);
                });
            }
            // Fill remaining with defaults if needed
            const targetCount = parseInt($("input-local-count")?.value || "2", 10);
            for (let i = names.length; i < targetCount; i++) {
                names.push(`Player ${i + 1}`);
            }
        } else if (mode === "VS_AI") {
            names.push("AI");
        } else if (mode === "ONLINE") {
            // Only my name for online; others join separately
        }

        return names;
    }

    async function loadKnownPlayers() {
        const dl = $("known-players");
        if (!dl) return;
        try {
            const list = await G.api.getPlayers();
            dl.innerHTML = "";
            const frag = document.createDocumentFragment();
            (list || []).forEach(p => {
                const opt = document.createElement("option");
                opt.value = p.username;
                frag.appendChild(opt);
            });
            dl.appendChild(frag);
        } catch (e) {
            dl.innerHTML = "";
        }
    }

    async function lookupPlayer(name) {
        const hint = $("player-hint");
        if (!hint) return;
        hint.textContent = "Searching...";
        try {
            const p = await G.api.getPlayerByUsername(name);
            if (p) {
                hint.textContent = "Returning player - " + (p.totalGames || 0) + " games, " + (p.totalWins || 0) + " wins";
            }
        } catch (e) {
            hint.textContent = "New player - profile created when you start";
        }
    }

    /* ---------------- setup modal UI ---------------- */
    async function setupModalWiring() {
        const desc = $("variant-desc");
        const seg = (id, key) => {
            $(id).querySelectorAll("button").forEach(b => {
                b.onclick = () => {
                    $(id).querySelectorAll("button").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    const dataKey = key === "mode" ? "mode" : (key === "difficulty" ? "diff" : "variant");
                    G.config[key] = b.dataset[dataKey];
                    if (key === "variant" && desc) desc.textContent = VARIANT_DESCS[G.config.variant] || "";
                    if (key === "mode") {
                        updateModeDesc();
                        refreshSetupFields();
                    }
                };
            });
        };
        seg("seg-variant", "variant");
        seg("seg-difficulty", "difficulty");
        if (desc) desc.textContent = VARIANT_DESCS[G.config.variant] || "";

        const modeBtns = $("seg-mode");
        if (modeBtns) {
            modeBtns.querySelectorAll("button").forEach(b => {
                b.onclick = () => {
                    modeBtns.querySelectorAll("button").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    G.config.mode = b.dataset.mode;
                    updateModeDesc();
                    refreshSetupFields();
                };
            });
            updateModeDesc();
            refreshSetupFields();
        }

        // Player name input
        const nameInput = $("input-name");
        if (nameInput) {
            nameInput.addEventListener("input", () => {
                renderLocalNames();
            });
            nameInput.addEventListener("change", () => {
                const val = nameInput.value.trim();
                if (val) lookupPlayer(val);
            });
            nameInput.addEventListener("blur", () => {
                const val = nameInput.value.trim();
                if (val) lookupPlayer(val);
            });
        }

        // Search button
        const searchBtn = $("btn-search-player");
        if (searchBtn) {
            searchBtn.onclick = () => {
                const val = nameInput ? nameInput.value.trim() : "";
                if (val) lookupPlayer(val);
            };
        }

        // Local player count slider
        const localCountInput = $("input-local-count");
        if (localCountInput) {
            localCountInput.addEventListener("input", () => {
                renderLocalNames();
            });
        }

        // Initial render
        renderLocalNames();
        loadKnownPlayers();

        $("btn-start").onclick = () => { $("setup-error").textContent = ""; startGame(); };
        $("btn-play-again").onclick = () => window.location.reload();

        // Secondary buttons reuse the existing mode/room logic — no new game rules.
        if ($("btn-create-room")) {
            $("btn-create-room").onclick = () => {
                selectSetupMode("ONLINE");
                if ($("input-room")) $("input-room").value = "";
                $("setup-error").textContent = "";
                startGame();
            };
        }

        if ($("btn-join-room")) {
            $("btn-join-room").onclick = () => {
                selectSetupMode("ONLINE");
                const code = $("input-room") ? $("input-room").value.trim().toUpperCase() : "";
                if (!/^\d{6}$/.test(code)) {
                    $("setup-error").textContent = "Enter a valid 6-digit room code";
                    if ($("input-room")) $("input-room").focus();
                    return;
                }
                $("setup-error").textContent = "";
                startGame();
            };
        }

        if ($("btn-leaderboard")) {
            $("btn-leaderboard").onclick = () => {
                const active = $("leaderboard-panel").querySelector(".lb-tabs button.active");
                loadLeaderboard(active ? active.dataset.by : "winrate");
            };
        }

        if ($("btn-close-qr")) {
            $("btn-close-qr").onclick = () => { $("qr-overlay").classList.add("hidden"); };
        }

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
            toggleBgMusic(G.soundOn);
        };
        $("btn-new").onclick = () => { $("setup-modal").classList.remove("hidden"); };
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

        // Enable admin-assigned keyboard roll controls (LOCAL multiplayer only)
        enableKeyboardRolling();

        // Deep-link join: ?room=CODE
        const params = new URLSearchParams(location.search);
        const deepRoom = params.get("room");
        if (deepRoom && /^\d{6}$/.test(deepRoom)) {
            const modeBtns = $("seg-mode");
            if (modeBtns) {
                modeBtns.querySelectorAll("button").forEach(b => {
                    b.classList.remove("active");
                    if (b.dataset.mode === "ONLINE") b.classList.add("active");
                });
            }
            G.config.mode = "ONLINE";
            updateModeDesc();
            refreshSetupFields();
            if ($("input-room")) $("input-room").value = deepRoom;
        }
    });
})();
