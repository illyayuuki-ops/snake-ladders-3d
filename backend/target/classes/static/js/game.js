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
        config: { variant: "CLASSIC", localCount: 2, localNames: [] },
        engine: null, stateQueue: null,
        // riddle state
        riddle: { active: false, resolve: null, reject: null, timer: null, timeLeft: 15, currentRiddle: null, slideEvent: null },
        // background music state
        bgMusic: { node: null, gain: null, playing: false }
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
        ensureAudio();
        if (!G.audio) return;
        // Resume audio context if suspended (browser autoplay policy)
        if (G.audio.state === "suspended") {
            G.audio.resume().then(() => createRetroMusic());
        } else {
            createRetroMusic();
        }
    }

    function stopBgMusic() {
        G.bgMusic.playing = false;
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

        questionEl.textContent = riddle.question;
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
        const selected = Array.from(document.querySelectorAll(".player-chip.selected")).map(el => el.dataset.name);
        if (selected.length < 2) { toast("Select at least 2 players"); return; }
        for (const n of selected) { try { await G.api.ensurePlayer(n); } catch (e) {} }

        G.mode = "LOCAL"; G.variant = cfg.variant; G.built = false; G.code = "LOCAL";
        const players = selected.map((n, i) => ({ name: n, ai: false, color: PALETTE[i % PALETTE.length] }));
        G.engine = new LocalEngine();
        const st = G.engine.create({ mode: "LOCAL", variant: cfg.variant, difficulty: "EASY", players });
        $("setup-modal").classList.add("hidden");
        applyState(st, false);
        scheduleNext(st);
        if (G.soundOn) startBgMusic();
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

        const chips = $("db-players");
        const nameInput = $("input-new-player");
        const searchResults = $("search-results");
        let searchDebounce = null;

        async function loadPlayers() {
            try {
                const list = await G.api.getPlayers();
                chips.innerHTML = "";
                list.forEach(p => {
                    const chip = document.createElement("div");
                    chip.className = "player-chip";
                    chip.dataset.name = p.username;
                    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PALETTE[0];
                    chip.appendChild(dot);
                    chip.appendChild(document.createTextNode(p.username));
                    chip.onclick = () => chip.classList.toggle("selected");
                    chips.appendChild(chip);
                });
            } catch (e) {
                chips.innerHTML = "<span style='font-size:11px;color:var(--muted)'>Could not load players</span>";
            }
        }

        function renderSearchResults(results) {
            searchResults.innerHTML = "";
            if (!results || results.length === 0) {
                searchResults.classList.add("hidden");
                return;
            }
            results.forEach(p => {
                const item = document.createElement("div");
                item.className = "search-result-item";
                item.textContent = p.username;
                item.onclick = () => {
                    // Check if already selected
                    const alreadySelected = chips.querySelector(`.player-chip[data-name="${p.username}"].selected`);
                    if (alreadySelected) {
                        toast("Already selected");
                        return;
                    }
                    // Select the chip if it exists
                    const existingChip = chips.querySelector(`.player-chip[data-name="${p.username}"]`);
                    if (existingChip) {
                        existingChip.classList.add("selected");
                    } else {
                        // Create a new chip for this search result
                        const chip = document.createElement("div");
                        chip.className = "player-chip selected";
                        chip.dataset.name = p.username;
                        const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PALETTE[0];
                        chip.appendChild(dot);
                        chip.appendChild(document.createTextNode(p.username));
                        chip.onclick = () => chip.classList.toggle("selected");
                        chips.appendChild(chip);
                    }
                    nameInput.value = "";
                    searchResults.classList.add("hidden");
                };
                searchResults.appendChild(item);
            });
            searchResults.classList.remove("hidden");
        }

        if (nameInput) {
            nameInput.addEventListener("input", () => {
                clearTimeout(searchDebounce);
                const query = nameInput.value.trim();
                if (!query) {
                    searchResults.classList.add("hidden");
                    return;
                }
                searchDebounce = setTimeout(async () => {
                    try {
                        const results = await G.api.searchPlayers(query, 20);
                        renderSearchResults(results);
                    } catch (e) {
                        searchResults.classList.add("hidden");
                    }
                }, 200);
            });

            // Hide dropdown when clicking outside
            document.addEventListener("click", (e) => {
                if (!nameInput.contains(e.target) && !searchResults.contains(e.target)) {
                    searchResults.classList.add("hidden");
                }
            });
        }

        await loadPlayers();

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
    });
})();
