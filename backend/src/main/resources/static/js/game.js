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
        config: { variant: "CLASSIC", localCount: 2, localNames: [], mode: "LOCAL" },
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
        if (st.boardChanged) G.board.respawnBoard(st);
        G.board.setCurrent(st.currentPlayerName);
        renderState(st);
        // LOCAL/VS_AI: the host still broadcasts to any online watchers (legacy path).
        // ONLINE: the server is the single source of truth and already broadcasts
        // authoritative STATE messages to every subscriber — do NOT re-broadcast here.
        if (G.isHost && G.ws && !G.online) {
            broadcastState(st);
        }
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
        // ONLINE mode: delegate to the server (authoritative). Never use a LocalEngine.
        if (G.online) {
            setRollLabel("Rolling…", false);
            sound("roll");
            G.api.sendRoom(G.code, "ROLL", player);
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
        // ONLINE mode: delegate to the server (authoritative). Never use a LocalEngine.
        if (G.online) {
            setRollLabel("Using…", false);
            G.api.sendRoom(G.code, "USE_POWERUP", { player: cur.name, type: type, target: target ? target.name : null });
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
        const selected = Array.from(document.querySelectorAll(".player-chip.selected")).map(el => el.dataset.name);

        const mode = G.config.mode || "LOCAL";
        if (mode === "ONLINE") {
            if (selected.length < 1) { toast("Select at least 1 player"); return; }
            await startOnlineGame(cfg, selected);
            return;
        }

        if (selected.length < 2) { toast("Select at least 2 players"); return; }
        if (G.soundOn) startBgMusic();
        for (const n of selected) { try { await G.api.ensurePlayer(n); } catch (e) {} }

        G.mode = "LOCAL"; G.variant = cfg.variant; G.built = false; G.code = "LOCAL";
        G.local = true;
        G.myName = selected[0]; // Track the first player as "me"
        const players = selected.map((n, i) => ({ name: n, ai: false, color: PALETTE[i % PALETTE.length] }));
        G.engine = new LocalEngine();
        const st = G.engine.create({ mode: "LOCAL", variant: cfg.variant, difficulty: "EASY", players });
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

    function connectWs(roomCode) {
        try {
            if (typeof SockJS !== 'undefined' && typeof Stomp !== 'undefined') {
                const socket = new SockJS('/ws');
                const stomp = Stomp.over(socket);
                stomp.connect({}, function () {
                    stomp.subscribe('/topic/room.' + roomCode, function (msg) {
                        try {
                            const data = JSON.parse(msg.body);
                            if (data.type === 'state' && !G.isHost) {
                                applyState(data.state, false);
                            }
                        } catch (e) {}
                    });
                    G.ws = stomp;
                });
            } else {
                G.ws = null;
            }
        } catch (e) {
            G.ws = null;
        }
    }

    function broadcastState(st) {
        if (G.ws && G.isHost && G.roomCode && G.ws.connected) {
            try {
                G.ws.send('/app/room.' + G.roomCode + '.state', JSON.stringify({
                    type: 'state',
                    state: st
                }));
            } catch (e) {}
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
        // ONLINE is server-authoritative: do NOT create a LocalEngine here.
        // The backend GameService owns the shared game state and broadcasts it.
        $("setup-modal").classList.add("hidden");
        showQrPanel(G.roomCode);
        toast("Room " + G.roomCode + " - share the code!");
        $("mode-label").textContent = "Online · Room " + G.roomCode + " · Waiting to start";
        await G.api.connectWs();
        G.api.subscribeRoom(G.code, onWs);
        // Ask the server for the current authoritative state (handles re-sync on reconnect)
        G.api.syncRoom(G.code).then(st => {
            if (st) {
                G.lastState = st;
                applyState(st, false);
                scheduleNext(st);
            }
        }).catch(() => {
            // No state yet (host hasn't started) — show an empty waiting state
            $("mode-label").textContent = "Online · Room " + G.roomCode + " · Waiting to start";
        });
        // Show the host's Start button in the QR panel
        const startBtn = $("btn-start-online");
        if (startBtn) {
            startBtn.classList.remove("hidden");
            startBtn.onclick = async () => {
                try {
                    await G.api.startRoom(G.code, G.myName);
                    toast("Game started!");
                } catch (e) {
                    toast("Could not start: " + e.message);
                }
            };
        }
    }

    /**
     * WebSocket message handler invoked on every broadcast from /topic/room.{code}.
     * The backend GameService is the single source of truth; apply its STATE
     * messages so remote moves render on every device in real time.
     */
    function onWs(data) {
        if (!data) return;
        if (data.type === "state" && data.state) {
            applyState(data.state, false);
        } else if (data.type === "error") {
            toast("Server error: " + (data.message || "unknown"));
        } else if (data.type === "roster" && data.players) {
            // Roster update (JOIN/LEAVE) — refresh the player list from server truth
            if (G.lastState) {
                G.lastState.players = data.players;
                renderState(G.lastState);
            }
        }
    }

    async function startOnlineRoomFromHost() {
        if (!G.code || !G.myName) return;
        try {
            await G.api.startRoom(G.code, G.myName);
            toast("Game started!");
        } catch (e) {
            toast("Could not start: " + e.message);
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
        // ONLINE is server-authoritative: do NOT create a LocalEngine here and
        // do NOT fabricate other seats/bots locally — the server owns the roster.
        $("setup-modal").classList.add("hidden");
        $("mode-label").textContent = "Online · Room " + roomCode;
        await G.api.connectWs();
        G.api.subscribeRoom(roomCode, onWs);
        // Tell the server we joined so it can broadcast the updated roster
        G.api.sendRoom(roomCode, "JOIN", G.myName);
        // Fetch authoritative state (re-sync on reconnect)
        G.api.syncRoom(roomCode).then(st => {
            if (st) {
                G.lastState = st;
                applyState(st, false);
                scheduleNext(st);
            }
        }).catch(() => {
            $("mode-label").textContent = "Online · Room " + roomCode + " · Waiting for host to start";
        });
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
        } else {
            desc.textContent = "Local multiplayer on one device.";
        }
    }

    function updateRoomFieldVisibility() {
        const field = $("room-field");
        if (!field) return;
        if (G.config.mode === "ONLINE") field.classList.remove("hidden");
        else field.classList.add("hidden");
    }

    /* ---------------- setup modal UI ---------------- */
    async function setupModalWiring() {
        const desc = $("variant-desc");
        const seg = (id, key) => {
            $(id).querySelectorAll("button").forEach(b => {
                b.onclick = () => {
                    $(id).querySelectorAll("button").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    G.config[key] = b.dataset[key.split("-")[0]] || b.dataset.variant || b.dataset.diff;
                    if (key === "variant" && desc) desc.textContent = VARIANT_DESCS[G.config.variant] || "";
                };
            });
        };
        seg("seg-variant", "variant");
        if (desc) desc.textContent = VARIANT_DESCS[G.config.variant] || "";

        const modeBtns = $("seg-mode");
        if (modeBtns) {
            modeBtns.querySelectorAll("button").forEach(b => {
                b.onclick = () => {
                    modeBtns.querySelectorAll("button").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    G.config.mode = b.dataset.mode;
                    updateModeDesc();
                    updateRoomFieldVisibility();
                };
            });
            updateModeDesc();
            updateRoomFieldVisibility();
        }

        const chips = $("db-players");
        const nameInput = $("input-new-player");
        const searchResults = $("search-results");
        let searchDebounce = null;

        async function loadPlayers() {
            try {
                const list = await G.api.getPlayers();
                G.allPlayers = list.map(p => p.username);
                // Chips container starts empty - only selected players become chips
                chips.innerHTML = "";
            } catch (e) {
                G.allPlayers = [];
                chips.innerHTML = "<span style='font-size:11px;color:var(--muted)'>Could not load players</span>";
            }
        }

        function renderSearchResults(results, query) {
            searchResults.innerHTML = "";
            const trimmedQuery = query.trim();
            if (!trimmedQuery) {
                searchResults.classList.add("hidden");
                return;
            }

            // Check if there's an exact match in results
            const exactMatch = results && results.some(p => p.username.toLowerCase() === trimmedQuery.toLowerCase());
            const hasResults = results && results.length > 0;

            // If no exact match, add "Use as new name" option at the top
            if (!exactMatch && trimmedQuery) {
                const newNameItem = document.createElement("div");
                newNameItem.className = "search-result-item search-result-new";
                newNameItem.innerHTML = `<span class="new-name-icon">+</span> Use "${trimmedQuery}" as a new name`;
                newNameItem.onclick = () => selectName(trimmedQuery);
                searchResults.appendChild(newNameItem);
            }

            // Add matching results
            if (hasResults) {
                results.forEach(p => {
                    // Skip exact match since we already have the "Use as new name" option
                    if (p.username.toLowerCase() === trimmedQuery.toLowerCase()) return;
                    const item = document.createElement("div");
                    item.className = "search-result-item";
                    item.textContent = p.username;
                    item.onclick = () => selectName(p.username);
                    searchResults.appendChild(item);
                });
            }

            searchResults.classList.remove("hidden");
        }

        function selectName(name) {
            const trimmedName = name.trim();
            if (!trimmedName) return;

            // Check if already selected
            const alreadySelected = chips.querySelector(`.player-chip[data-name="${trimmedName}"].selected`);
            if (alreadySelected) {
                toast("Already selected");
                return;
            }
            // Enforce max 4 players
            const selectedCount = chips.querySelectorAll(".player-chip.selected").length;
            if (selectedCount >= 4) {
                toast("Maximum 4 players allowed");
                return;
            }
            // Select the chip if it exists
            const existingChip = chips.querySelector(`.player-chip[data-name="${trimmedName}"]`);
            if (existingChip) {
                existingChip.classList.add("selected");
            } else {
                // Create a new chip for this name
                const chip = document.createElement("div");
                chip.className = "player-chip selected";
                chip.dataset.name = trimmedName;
                const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PALETTE[selectedCount % PALETTE.length];
                chip.appendChild(dot);
                chip.appendChild(document.createTextNode(trimmedName));
                chip.onclick = () => {
                    chip.classList.toggle("selected");
                    updateSearchVisibility();
                };
                chips.appendChild(chip);
            }
            nameInput.value = "";
            searchResults.classList.add("hidden");
            updateSearchVisibility();
        }

        function updateSearchVisibility() {
            const selectedCount = chips.querySelectorAll(".player-chip.selected").length;
            const addPlayerRow = document.querySelector(".add-player-row");
            if (addPlayerRow) {
                addPlayerRow.style.display = selectedCount >= 4 ? "none" : "block";
            }
            // Also update chip click handlers to call updateSearchVisibility on deselect
            chips.querySelectorAll(".player-chip").forEach(chip => {
                const originalClick = chip.onclick;
                chip.onclick = (e) => {
                    if (originalClick) originalClick.call(chip, e);
                    updateSearchVisibility();
                };
            });
        }

        if (nameInput) {
            nameInput.addEventListener("input", () => {
                clearTimeout(searchDebounce);
                const query = nameInput.value.trim();
                if (!query) {
                    searchResults.classList.add("hidden");
                    return;
                }
                searchDebounce = setTimeout(() => {
                    // Filter locally from G.allPlayers (case-insensitive substring match)
                    const filtered = (G.allPlayers || [])
                        .filter(name => name.toLowerCase().includes(query.toLowerCase()))
                        .slice(0, 10)
                        .map(username => ({ username }));
                    renderSearchResults(filtered, query);
                }, 150);
            });

            // Enter key to commit typed name as new
            nameInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const query = nameInput.value.trim();
                    if (query) {
                        selectName(query);
                    }
                }
            });

            // Hide dropdown when clicking outside
            document.addEventListener("click", (e) => {
                if (!nameInput.contains(e.target) && !searchResults.contains(e.target)) {
                    searchResults.classList.add("hidden");
                }
            });
        }

        await loadPlayers();
        updateSearchVisibility();

        $("btn-start").onclick = () => { $("setup-error").textContent = ""; startGame(); };
        $("btn-play-again").onclick = () => window.location.reload();

        if ($("btn-join-room")) {
            $("btn-join-room").onclick = () => {
                const code = $("input-room").value.trim().toUpperCase();
                if (!/^\d{6}$/.test(code)) {
                    $("setup-error").textContent = "Enter a valid 6-digit room code";
                    return;
                }
                $("setup-error").textContent = "";
                startGame();
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
            updateRoomFieldVisibility();
            if ($("input-room")) $("input-room").value = deepRoom;
        }
    });
})();
