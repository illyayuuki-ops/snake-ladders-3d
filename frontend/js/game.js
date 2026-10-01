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
        built: false, builtCode: null, builtSize: 0, builtMap: null, drawnState: null,
        soundOn: true, audio: null,
        config: { variant: "CLASSIC", difficulty: "EASY", localCount: 2, localNames: [], mode: "LOCAL", visibility: "PRIVATE" },
        engine: null, stateQueue: [],
        local: false, // true only for LOCAL multiplayer (keyboard roll mapping applies)
        online: false, // true only for ONLINE (server-authoritative) mode
        // riddle state
        riddle: { active: false, resolve: null, reject: null, timer: null, outcomeTimer: null, resolved: false, timeLeft: 15, currentRiddle: null, slideEvent: null, slideState: null },
        // background music state
        bgMusic: { node: null, gain: null, playing: false, volume: 0.3 },
        // SFX volume (independent from music)
        sfxVolume: 1.0,
        // online mode state
        ws: null, roomCode: null, onlinePlayers: [], isHost: false
    };
    const LOCAL_SAVE_KEY = "sl3d_local_save";
    let lastCurrentPlayer = null; // Track previous player for pass-and-play toast

    /* ---------------- local persistence ---------------- */
    function saveLocalGame(st) {
        if (!st || G.online) return;
        try {
            const saveData = {
                state: st,
                timestamp: Date.now()
            };
            localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saveData));
        } catch (e) { /* ignore quota errors */ }
    }

    function loadLocalGame() {
        try {
            const raw = localStorage.getItem(LOCAL_SAVE_KEY);
            if (!raw) return null;
            const saveData = JSON.parse(raw);
            if (!saveData || !saveData.state) return null;
            const st = saveData.state;
            // Only restore if game is in progress (not finished)
            if (st.status === "FINISHED") {
                clearLocalGame();
                return null;
            }
            return st;
        } catch (e) {
            clearLocalGame();
            return null;
        }
    }

    function clearLocalGame() {
        try { localStorage.removeItem(LOCAL_SAVE_KEY); } catch (e) {}
    }

    /* ---------------- audio ---------------- */
    function ensureAudio() {
        if (!G.audio) { try { G.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    }
    function beep(freq, dur, type, vol) {
        if (!G.soundOn || !G.audio) return;
        const o = G.audio.createOscillator(), g = G.audio.createGain();
        o.type = type || "sine"; o.frequency.value = freq;
        g.gain.value = (vol || 0.06) * G.sfxVolume;
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
        gain.gain.value = 0.2 * G.bgMusic.volume;
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
            g.gain.value = note.vol * G.bgMusic.volume;
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

    async function startBgMusic() {
        if (G.bgMusic.playing) return;
        // Ensure AudioContext is running (needs user gesture)
        ensureAudio();
        if (G.audio && G.audio.state === "suspended") {
            await G.audio.resume();
        }
        // Try HTML audio element first (file-based)
        const audioEl = $("bg-music");
        const source = audioEl && audioEl.querySelector("source[src]");
        if (source) {
            audioEl.volume = G.bgMusic.volume;
            try {
                await audioEl.play();
                G.bgMusic.node = audioEl;
                G.bgMusic.playing = true;
                return;
            } catch (e) {
                console.error("[bg-music] HTML audio play failed:", e);
                // Fall through to procedural
            }
        }
        // Fallback to procedural
        if (!G.audio) return;
        createRetroMusic();
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

    function setBgMusicVolume(vol) {
        G.bgMusic.volume = Math.max(0, Math.min(1, vol));
        const audioEl = $("bg-music");
        if (audioEl) audioEl.volume = G.bgMusic.volume;
        if (G.bgMusic.gain) G.bgMusic.gain.gain.value = 0.2 * G.bgMusic.volume;
    }

    function toggleBgMusic(on) {
        if (on) startBgMusic(); else stopBgMusic();
    }

    /* ---------------- riddle handling ---------------- */
    function fetchRiddle() {
        // riddles.js is an optional enhancement: it is a separate script tag and can
        // fail to load (offline first run, stale service-worker cache). Never let a
        // missing pool throw inside the move pipeline — resolve null instead and let
        // the caller fall back to applying the slide directly.
        const hasPool = (typeof Riddles !== "undefined") && typeof Riddles.pickRandom === "function";
        if (!hasPool) return Promise.resolve(null);
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

        // Fresh round: the button submits an answer until one is accepted, then
        // becomes the Continue button that applies the outcome.
        G.riddle.resolved = false;
        submitBtn.textContent = "Submit";
        submitBtn.disabled = false;
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
        if (G.riddle.outcomeTimer) {
            clearTimeout(G.riddle.outcomeTimer);
            G.riddle.outcomeTimer = null;
        }
    }

    function handleRiddleAnswer(correct, userAnswer) {
        if (G.riddle.resolved) return; // ignore double submits / timer racing a click
        G.riddle.resolved = true;

        const feedbackEl = $("riddle-feedback");
        const submitBtn = $("riddle-submit");
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
        const snakeHead = slideEvent.path[slideEvent.path.length - 1];
        const snakeTail = slideEvent.to;
        // The state that produced this slide — afterMove must respawn/settle
        // against it, not against a newer state that may carry another map.
        const slideState = G.riddle.slideState || G.lastState;

        const applyOutcome = () => {
            if (G.riddle.outcomeTimer) { clearTimeout(G.riddle.outcomeTimer); G.riddle.outcomeTimer = null; }
            hideRiddleModal();
            if (correct) {
                slideState.players.forEach(p => {
                    if (p.name === playerName) p.position = snakeHead;
                });
                slideState.log.push(playerName + " solved a riddle and dodged the snake!");
                G.board.moveAlong(playerName, slideEvent.path, snakeHead, "CLIMB", () => afterMove(slideState));
            } else {
                G.board.moveAlong(playerName, slideEvent.path, snakeTail, "SLIDE", () => afterMove(slideState));
            }
        };

        // The button turns into Continue so the player can move on as soon as they
        // have read the result; the timeout closes it for anyone who doesn't.
        submitBtn.textContent = "Continue";
        submitBtn.disabled = false;
        submitBtn.onclick = applyOutcome;
        G.riddle.outcomeTimer = setTimeout(applyOutcome, 2500);
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
    /**
     * Identity of the drawn connector map. The room code and size are NOT enough:
     * two consecutive local games share roomCode "LOCAL" and size 100, and a CHAOS
     * reshuffle keeps both while replacing every snake/ladder. Hash the actual
     * snakes/ladders/powerups (plus boardSequence) so a changed map is always
     * treated as a different board.
     */
    function boardMapKey(st) {
        if (!st) return null;
        try {
            const norm = (o) => Object.keys(o || {}).sort()
                .map(k => k + ">" + o[k]).join(",");
            return (st.boardSequence != null ? "seq" + st.boardSequence + "|" : "")
                + "L[" + norm(st.ladders) + "]S[" + norm(st.snakes) + "]P[" + norm(st.powerups) + "]";
        } catch (e) { return null; }
    }

    /**
     * Make the rendered board match `st` exactly. Rebuilds whenever the room
     * code, the size OR the connector map differs from what is currently drawn,
     * so the renderer can never show another game's (or a pre-reshuffle) map.
     */
    function ensureBuild(st) {
        if (!st) return;
        const key = boardMapKey(st);
        if (!G.built || G.builtCode !== st.roomCode || G.builtSize !== st.size || G.builtMap !== key) {
            G.board.build(st);
            markBuilt(st);
        }
    }

    /** Record that the board on screen now shows `st`'s map (after build/respawnBoard). */
    function markBuilt(st) {
        G.built = true; G.builtCode = st.roomCode; G.builtSize = st.size; G.builtMap = boardMapKey(st);
        G.drawnState = st;
    }

    /** Full reset of the build guard — used whenever a new game is started. */
    function resetBuild() {
        G.built = false; G.builtCode = null; G.builtSize = 0; G.builtMap = null; G.drawnState = null;
    }

    /* ---------------- apply a state (animate if it carries a move) ---------------- */
    async function applyState(st, animate) {
        G.lastState = st;
        // Save local game state for LOCAL/VS_AI modes (not online)
        if (!G.online) saveLocalGame(st);
        // A CHAOS reshuffle ships the NEW map in the very same state that carries
        // the move, but lastEvent.path was computed on the map that was drawn when
        // the dice were rolled. So while that move animates, the board on screen
        // must still be the map that produced the path — re-assert it here (BEFORE
        // moveAlong) instead of letting the incoming state's map overwrite it, and
        // swap in the reshuffled map only once the animation ends (afterMove).
        const animatingPreReshuffleMove = !!(animate && st.lastEvent && st.boardChanged);
        ensureBuild(animatingPreReshuffleMove ? (G.drawnState || st) : st);
        if (animate && st.lastEvent) {
            if (G.busy) {
                G.stateQueue.push({ st, animate });
                return;
            }
if (st.lastEvent.kind === "SLIDE") {
            G.busy = true;
            setRollLabel("Rolling…", false);
            sound("snake");
            G.dice.roll(st.dice, async () => {
                const slideEvent = st.lastEvent;
                // Check if the player who landed on the snake is an AI
                const slidePlayer = st.players.find(p => p.name === slideEvent.player);
                const isAI = slidePlayer && slidePlayer.ai;
                if (isAI) {
                    // AI auto-resolves: always slide down (fail the riddle)
                    G.board.moveAlong(slideEvent.player, slideEvent.path, slideEvent.to, "SLIDE", () => afterMove(st));
                    return;
                }
                const riddle = await fetchRiddle();
                if (!riddle) {
                    // No riddle pool available — the snake still bites.
                    G.board.moveAlong(slideEvent.player, slideEvent.path, slideEvent.to, "SLIDE", () => afterMove(st));
                    return;
                }
                G.riddle.currentRiddle = riddle;
                G.riddle.slideEvent = slideEvent;
                G.riddle.slideState = st;
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
            // No move to animate: ensureBuild has already brought the board in line
            // with this state (a reshuffled map forces a rebuild), so only the pawn
            // positions need re-syncing here.
            st.players.forEach(p => G.board.placeToken(p.name, p.position, false));
            afterMove(st);
        }
    }

    function afterMove(st) {
        console.log("[TRACE] afterMove called, status=" + st.status + " cur=" + st.currentPlayerName);
        // Safe to swap in a reshuffled (CHAOS) map now: any move carried by this
        // state has finished animating, so the connectors on screen and the
        // positions of the pawns describe the same board again.
        if (st.boardChanged) { G.board.respawnBoard(st); markBuilt(st); }
        G.board.setCurrent(st.currentPlayerName);
        renderState(st);
        G.busy = false;
        // Process queued states (FIFO)
        while (G.stateQueue.length > 0) {
            const next = G.stateQueue.shift();
            applyState(next.st, next.animate);
            // If the next state starts an animation, it will set G.busy = true
            // and we'll stop processing until that animation completes
            if (G.busy) break;
        }
        if (st.status === "FINISHED") {
            clearLocalGame();
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

        // Pass-and-play toast for LOCAL mode (not VS_AI, not ONLINE)
        if (G.local && !G.online && lastCurrentPlayer && lastCurrentPlayer !== cur.name) {
            toast("Pass to " + cur.name);
        }
        lastCurrentPlayer = cur.name;

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
        updateChatVisibility();
        updateTurnTimer(st);
    }

    function renderPowerups(st, cur) {
        const wrap = $("powerups"); wrap.innerHTML = "";
        if (!cur || cur.ai) return;
        if (cur.hasDouble) {
            const b = document.createElement("button"); b.className = "pw-btn"; b.textContent = "🎲 Double Roll";
            b.title = "Double Roll: Roll two dice and move the sum";
            b.onclick = () => usePowerup("DOUBLE"); wrap.appendChild(b);
        }
        if (cur.hasFreeze) {
            const t = currentLeader(st, cur);
            if (t) {
                const b = document.createElement("button"); b.className = "pw-btn"; b.textContent = "❄️ Freeze " + t.name;
                b.title = "Freeze: Skip the target player's next turn";
                b.onclick = () => usePowerup("FREEZE"); wrap.appendChild(b);
            }
        }
        if (cur.shield) {
            const b = document.createElement("button"); b.className = "pw-btn"; b.disabled = true; b.textContent = "🛡 Shield";
            b.title = "Shield: Protects you from one snake";
            wrap.appendChild(b);
        }
    }

    function renderChatMessage(sender, text) {
        const list = $("chat-messages");
        if (!list) return;
        const li = document.createElement("li");
        li.innerHTML = "<span class='chat-sender'>" + sender + ":</span><span class='chat-text'>" + text + "</span>";
        list.appendChild(li);
        list.scrollTop = list.scrollHeight;
    }

    function updateChatVisibility() {
        const chatPanel = $("chat-panel");
        if (!chatPanel) return;
        if (G.mode === "ONLINE") {
            chatPanel.classList.remove("hidden");
        } else {
            chatPanel.classList.add("hidden");
        }
    }

    function updateTurnTimer(st) {
        const timerStat = $("turn-timer-stat");
        const timerEl = $("turn-timer");
        if (!timerStat || !timerEl) return;
        if (G.online && st && st.turnTimeRemainingMs != null && st.turnTimeRemainingMs > 0 && st.status === "PLAYING") {
            timerStat.style.display = "flex";
            const seconds = Math.ceil(st.turnTimeRemainingMs / 1000);
            timerEl.textContent = seconds;
            timerEl.style.color = seconds <= 10 ? "var(--bad)" : "var(--text)";
        } else {
            timerStat.style.display = "none";
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
        G.api.leaderboard(by, 10, G.myName).then(data => renderLeaderboard(data, by)).catch(() => renderLocalLeaderboard(by, true));
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
    function renderLocalLeaderboard(by, offline) {
        const lb = loadLocalLeaderboard();
        let sorted = lb.slice();
        if (by === "wins") sorted.sort((a, b) => b.totalWins - a.totalWins || a.totalGames - b.totalGames);
        else if (by === "fastest") sorted.sort((a, b) => (a.fastestWinTurns || 1e9) - (b.fastestWinTurns || 1e9));
        else sorted.sort((a, b) => (b.totalWins / (b.totalGames || 1)) - (a.totalWins / (a.totalGames || 1)));
        const ol = $("leaderboard-list"); ol.innerHTML = "";
        if (offline) {
            const li = document.createElement("li");
            li.className = "lb-offline";
            li.textContent = "Offline \u2014 local stats";
            ol.appendChild(li);
        }
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
        clearLocalGame(); // Clear any saved game when starting a new one
        lastCurrentPlayer = null; // Reset pass-and-play tracker
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

        G.mode = "LOCAL"; G.variant = cfg.variant; resetBuild();
        G.code = "LOCAL";
        G.local = true;
        G.myName = selected[0]; // Track the first player as "me"
        const players = selected.map((n, i) => ({ name: n, ai: (mode === "VS_AI" && i > 0), color: PALETTE[i % PALETTE.length] }));
        G.engine = new LocalEngine();
        const st = G.engine.create({ mode: "LOCAL", variant: cfg.variant, difficulty: cfg.difficulty || "EASY", players });
        $("setup-modal").classList.add("hidden");
        applyState(st, false);
        scheduleNext(st);
    }

    /* ---------------- rematch (restart with same settings) ---------------- */
    function startRematch() {
        ensureAudio();
        lastCurrentPlayer = null; // Reset pass-and-play tracker
        const st = G.lastState;
        if (!st) { window.location.reload(); return; }
        const cfg = G.config;
        const mode = st.mode || cfg.mode || "LOCAL";
        const variant = st.variant || cfg.variant || "CLASSIC";
        const difficulty = st.difficulty || cfg.difficulty || "EASY";
        const roomCode = st.roomCode;
        const isOnline = mode === "ONLINE";

        // Collect player names from the finished state
        const playerNames = st.players.map(p => p.name);

        if (isOnline) {
            // For online, we need to rejoin/create room with same code if host
            if (G.isHost && roomCode && roomCode !== "LOCAL") {
                // Host can start a new game in the same room
                G.api.sendRoom(roomCode, "START", G.myName, null);
                toast("Starting rematch…");
            } else if (!G.isHost && roomCode && roomCode !== "LOCAL") {
                // Non-host: rejoin the room
                G.api.sendRoom(roomCode, "JOIN", G.myName, { ai: false });
                toast("Rejoining for rematch…");
            } else {
                // Fallback
                window.location.reload();
            }
            return;
        }

        // LOCAL / VS_AI rematch
        if (G.soundOn) startBgMusic();
        for (const n of playerNames) { try { G.api.ensurePlayer(n); } catch (e) {} }

        G.mode = mode; G.variant = variant; resetBuild();
        G.code = "LOCAL";
        G.local = true;
        G.myName = playerNames[0];
        const players = playerNames.map((n, i) => ({ name: n, ai: (mode === "VS_AI" && i > 0), color: PALETTE[i % PALETTE.length] }));
        G.engine = new LocalEngine();
        const newSt = G.engine.create({ mode: "LOCAL", variant: variant, difficulty: difficulty, players });
        $("win-overlay").classList.add("hidden");
        applyState(newSt, false);
        scheduleNext(newSt);
    }

    /* ---------------- resume local game ---------------- */
    function resumeLocalGame(st) {
        ensureAudio();
        if (G.soundOn) startBgMusic();
        const mode = st.mode || "LOCAL";
        const variant = st.variant || "CLASSIC";
        const difficulty = st.difficulty || "EASY";

        G.mode = mode; G.variant = variant; resetBuild();
        G.code = "LOCAL";
        G.local = true;
        G.myName = st.players[0]?.name || "Player 1";

        G.engine = new LocalEngine();
        // Restore the exact state from localStorage
        G.engine.seats = st.players.map(p => ({
            name: p.name, ai: p.ai, difficulty: p.difficulty || "EASY", color: p.color,
            position: p.position, shield: p.shield, doubleAvailable: p.hasDouble,
            freezeAvailable: p.hasFreeze, pendingDouble: false,
            frozenTurns: p.frozen, finished: p.finished, placement: p.placement,
            personalTurns: p.personalTurns
        }));
        G.engine.currentIndex = st.currentTurn;
        G.engine.dice = st.dice;
        G.engine.turnCount = st.turnCount;
        G.engine.status = st.status;
        G.engine.winner = st.winner;
        G.engine.boardSequence = st.boardSequence;
        G.engine.boardChanged = st.boardChanged;
        G.engine.board = { size: st.size, snakes: st.snakes, ladders: st.ladders, powerups: st.powerups };
        G.engine.log = st.log || [];
        G.engine.lastEvent = st.lastEvent;
        G.engine.finishedCount = st.players.filter(p => p.finished).length;

        const restoredState = G.engine.state();
        $("setup-modal").classList.add("hidden");
        applyState(restoredState, false);
        scheduleNext(restoredState);
        toast("Game resumed!");
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
        const visibility = G.config.visibility || "PRIVATE";
        try {
            const resp = await G.api.createRoom(G.myName, "ONLINE", G.config.variant, visibility);
            G.roomCode = resp.roomCode;
        } catch (e) {
            G.roomCode = Math.floor(100000 + Math.random() * 900000).toString();
        }
        G.mode = "ONLINE"; G.variant = G.config.variant; resetBuild();
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
        // Wire up connection degraded notification (WS -> REST fallback)
        G.api.setOnDegraded(msg => toast(msg));
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
     * WebSocketOutMessage envelope ({ type: STATE|ERROR|INFO|CHAT, roomCode, state, message })
     * per event. The client is a thin viewer — it never recomputes game state and
     * never sends STATE itself; all actions (ROLL/USE_POWERUP/JOIN/START/CHAT) go to the
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
        } else if (type === "CHAT") {
            // Chat message received
            const sender = data.player || "Unknown";
            const text = data.message || "";
            renderChatMessage(sender, text);
            // Auto-show chat panel when a message arrives (unless user closed it)
            const chatPanel = $("chat-panel");
            if (chatPanel && chatPanel.classList.contains("hidden")) {
                chatPanel.classList.remove("hidden");
            }
        } else if (type === "INFO") {
            // Informational broadcast — no UI action required.
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
        G.mode = "ONLINE"; G.variant = G.config.variant; resetBuild();
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
        // Wire up connection degraded notification (WS -> REST fallback)
        G.api.setOnDegraded(msg => toast(msg));
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

    /* ---------------- QR Code Scanner for joining rooms ---------------- */
    let qrScanner = null;
    let qrScannerStop = null;

    async function startQrScanner() {
        const videoContainer = $("qr-scanner-video");
        const statusEl = $("qr-scanner-status");
        const scanBtn = $("btn-scan-qr");
        const stopBtn = $("btn-stop-qr-scan");
        const hintEl = $("qr-scan-hint");
        const container = $("qr-scanner-container");

        if (!videoContainer || !statusEl) return;

        // Check for secure context (required for camera access)
        const isSecureContext = window.isSecureContext ||
            location.hostname === "localhost" ||
            location.hostname === "127.0.0.1";
        if (!isSecureContext) {
            hintEl.textContent = "Camera requires HTTPS. Please use manual code entry or host on HTTPS.";
            hintEl.style.display = "block";
            return;
        }

        // Check for BarcodeDetector API support
        if (!("BarcodeDetector" in window)) {
            hintEl.textContent = "QR scanning not supported in this browser. Please use manual code entry.";
            hintEl.style.display = "block";
            return;
        }

        // Check if barcode detector supports QR codes
        try {
            const formats = await BarcodeDetector.getSupportedFormats();
            if (!formats.includes("qr_code")) {
                hintEl.textContent = "QR code format not supported. Please use manual code entry.";
                hintEl.style.display = "block";
                return;
            }
        } catch (e) {
            // If getSupportedFormats fails, try anyway
        }

        // Show scanner UI
        container.classList.remove("hidden");
        scanBtn.classList.add("hidden");
        hintEl.style.display = "none";
        statusEl.textContent = "Starting camera...";

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
            });

            const video = document.createElement("video");
            video.srcObject = stream;
            video.setAttribute("playsinline", "");
            video.setAttribute("autoplay", "");
            video.muted = true;
            video.style.width = "100%";
            video.style.height = "auto";
            videoContainer.innerHTML = "";
            videoContainer.appendChild(video);

            await video.play();

            const detector = new BarcodeDetector({ formats: ["qr_code"] });
            statusEl.textContent = "Point camera at QR code...";

            let scanning = true;
            qrScannerStop = () => { scanning = false; };

            async function scanLoop() {
                if (!scanning) {
                    stream.getTracks().forEach(t => t.stop());
                    videoContainer.innerHTML = "";
                    container.classList.add("hidden");
                    scanBtn.classList.remove("hidden");
                    return;
                }

                try {
                    const barcodes = await detector.detect(video);
                    if (barcodes.length > 0) {
                        const rawValue = barcodes[0].rawValue;
                        scanning = false;
                        stream.getTracks().forEach(t => t.stop());
                        videoContainer.innerHTML = "";
                        container.classList.add("hidden");
                        scanBtn.classList.remove("hidden");
                        statusEl.textContent = "";
                        handleQrResult(rawValue);
                        return;
                    }
                } catch (e) {
                    // Detection failed, continue scanning
                }

                requestAnimationFrame(scanLoop);
            }

            requestAnimationFrame(scanLoop);

            // Stop button handler
            stopBtn.onclick = () => {
                if (qrScannerStop) qrScannerStop();
            };

        } catch (e) {
            console.error("QR scanner error:", e);
            statusEl.textContent = "Camera access denied or unavailable.";
            container.classList.add("hidden");
            scanBtn.classList.remove("hidden");
            if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
                hintEl.textContent = "Camera permission denied. Please allow camera access or use manual entry.";
                hintEl.style.display = "block";
            }
        }
    }

    function stopQrScanner() {
        if (qrScannerStop) {
            qrScannerStop();
            qrScannerStop = null;
        }
        const container = $("qr-scanner-container");
        const scanBtn = $("btn-scan-qr");
        if (container) container.classList.add("hidden");
        if (scanBtn) scanBtn.classList.remove("hidden");
    }

    function handleQrResult(rawValue) {
        // Parse room code from QR data
        // Expected formats: "123456" or "/?room=123456" or "https://host/?room=123456"
        let roomCode = null;
        if (/^\d{6}$/.test(rawValue.trim())) {
            roomCode = rawValue.trim();
        } else {
            // Try to extract from URL
            const urlMatch = rawValue.match(/[?&]room=(\d{6})/);
            if (urlMatch) roomCode = urlMatch[1];
        }

        if (roomCode) {
            const inputRoom = $("input-room");
            if (inputRoom) {
                inputRoom.value = roomCode;
                toast("QR code scanned: Room " + roomCode);
            }
        } else {
            toast("QR code did not contain a valid room code");
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
            const inputId = `local-name-${i + 1}`;
            const labelEl = document.createElement("label");
            labelEl.htmlFor = inputId;
            labelEl.textContent = `Player ${i + 1}`;
            labelEl.style.cssText = "display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;line-height:1.2;";

            const input = document.createElement("input");
            input.type = "text";
            input.id = inputId;
            input.name = `local-name-${i + 1}`;
            input.maxLength = 18;
            input.placeholder = `Player ${i + 1} name`;
            input.autocomplete = "off";
            input.value = currentNames[i] || (i === 0 ? ($("input-name")?.value?.trim() || "") : "");
            input.style.cssText = "width:100%;min-width:0;border-radius:8px;padding:6px 10px;font-size:13px;font-family:inherit;border:1px solid var(--glass-brd);background:rgba(255,255,255,0.04);color:var(--text);transition:border-color 0.15s,box-shadow 0.15s,background 0.15s;";

            const wrapper = document.createElement("div");
            wrapper.appendChild(labelEl);
            wrapper.appendChild(input);
            container.appendChild(wrapper);
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

    async function lookupPlayer(name, announce) {
        const input = $("input-name");
        // No inline hint paragraph in the compact modal: report via tooltip, and
        // via toast only when explicitly requested (search button), so typing stays quiet.
        try {
            const p = await G.api.getPlayerByUsername(name);
            if (p) {
                const msg = "Returning player - " + (p.totalGames || 0) + " games, " + (p.totalWins || 0) + " wins";
                if (input) input.title = msg;
                if (announce) toast(msg);
            }
        } catch (e) {
            const msg = "New player - profile created when you start";
            if (input) input.title = msg;
            if (announce) toast(msg);
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

        // Visibility segment (ONLINE create)
        const visBtns = $("seg-visibility");
        if (visBtns) {
            visBtns.querySelectorAll("button").forEach(b => {
                b.onclick = () => {
                    visBtns.querySelectorAll("button").forEach(x => x.classList.remove("active"));
                    b.classList.add("active");
                    G.config.visibility = b.dataset.visibility;
                };
            });
        }

        // Lobby: load public rooms when ONLINE mode is shown
        async function loadLobby() {
            const listEl = $("public-rooms-list");
            const emptyEl = $("lobby-empty");
            if (!listEl) return;
            try {
                const rooms = await G.api.getPublicRooms();
                listEl.innerHTML = "";
                if (!rooms || rooms.length === 0) {
                    if (emptyEl) emptyEl.style.display = "block";
                    return;
                }
                if (emptyEl) emptyEl.style.display = "none";
                for (const room of rooms) {
                    const row = document.createElement("div");
                    row.style.cssText = "padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.04); margin-bottom: 6px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;";
                    row.onmouseenter = () => row.style.background = "rgba(110,168,254,0.15)";
                    row.onmouseleave = () => row.style.background = "rgba(255,255,255,0.04)";
                    const playersCount = room.players ? room.players.length : 0;
                    row.innerHTML = `
                        <div>
                            <div style="font-weight: 600;">${room.roomCode}</div>
                            <div style="font-size: 11px; color: var(--muted);">Host: ${room.hostUsername} · ${playersCount}/4 players</div>
                        </div>
                        <span style="color: var(--accent);">Join →</span>
                    `;
                    row.onclick = () => {
                        // Prefill room code and join
                        if ($("input-room")) $("input-room").value = room.roomCode;
                        startGame();
                    };
                    listEl.appendChild(row);
                }
            } catch (e) {
                console.error("Failed to load lobby:", e);
                if (emptyEl) {
                    emptyEl.textContent = "Failed to load public rooms.";
                    emptyEl.style.display = "block";
                }
            }
        }

        // Refresh lobby button
        const refreshLobbyBtn = $("btn-refresh-lobby");
        if (refreshLobbyBtn) {
            refreshLobbyBtn.onclick = () => loadLobby();
        }

        // Show/hide public rooms list when ONLINE mode is selected
        function toggleLobbyVisibility() {
            const field = $("field-public-rooms");
            if (field) {
                if (G.config.mode === "ONLINE") {
                    field.classList.remove("hidden");
                    loadLobby();
                } else {
                    field.classList.add("hidden");
                }
            }
        }

        // Override refreshSetupFields to also toggle lobby
        const origRefresh = refreshSetupFields;
        refreshSetupFields = function() {
            origRefresh();
            toggleLobbyVisibility();
        };

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
                if (val) lookupPlayer(val, true);
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

        // Show/hide Resume button based on saved game
        const resumeBtn = $("btn-resume");
        if (resumeBtn) {
            const saved = loadLocalGame();
            if (saved) {
                resumeBtn.classList.remove("hidden");
            } else {
                resumeBtn.classList.add("hidden");
            }
        }

        $("btn-start").onclick = () => { $("setup-error").textContent = ""; startGame(); };
        $("btn-play-again").onclick = () => window.location.reload();
        $("btn-rematch").onclick = () => startRematch();

        // Resume button
        if ($("btn-resume")) {
            $("btn-resume").onclick = () => {
                const saved = loadLocalGame();
                if (saved) {
                    resumeLocalGame(saved);
                } else {
                    toast("No saved game to resume");
                }
            };
        }

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

        /* Sound panel toggle with volume slider */
        let soundPanel = null;
        function createSoundPanel() {
            if (soundPanel) return soundPanel;
            const panel = document.createElement("div");
            panel.className = "sound-panel hidden";
            panel.innerHTML = `
                <div class="sound-panel-header">
                    <span class="sound-title">🔊 Audio</span>
                    <button class="sound-close">✕</button>
                </div>
                <div class="sound-row">
                    <label class="sound-toggle">
                        <input type="checkbox" id="sound-master" ${G.soundOn ? "checked" : ""}>
                        <span class="toggle-slider"></span>
                        <span>Master Sound</span>
                    </label>
                </div>
                <div class="sound-row">
                    <label for="music-volume">Music Volume</label>
                    <input type="range" id="music-volume" min="0" max="1" step="0.05" value="${G.bgMusic.volume}">
                    <output id="music-volume-val">${Math.round(G.bgMusic.volume * 100)}%</output>
                </div>
                <div class="sound-row">
                    <label for="sfx-volume">SFX Volume</label>
                    <input type="range" id="sfx-volume" min="0" max="1" step="0.05" value="${G.sfxVolume}">
                    <output id="sfx-volume-val">${Math.round(G.sfxVolume * 100)}%</output>
                </div>
            `;
            document.body.appendChild(panel);
            soundPanel = panel;

            // Master toggle
            const masterCheckbox = panel.querySelector("#sound-master");
            masterCheckbox.onchange = () => {
                G.soundOn = masterCheckbox.checked;
                $("btn-sound").textContent = G.soundOn ? "🔊" : "🔇";
                if (G.soundOn) { ensureAudio(); if (G.audio.state === "suspended") G.audio.resume(); }
                toggleBgMusic(G.soundOn);
            };

            // Music volume
            const musicVol = panel.querySelector("#music-volume");
            const musicVolOut = panel.querySelector("#music-volume-val");
            musicVol.oninput = () => {
                const v = parseFloat(musicVol.value);
                setBgMusicVolume(v);
                musicVolOut.textContent = Math.round(v * 100) + "%";
            };

            // SFX volume
            const sfxVol = panel.querySelector("#sfx-volume");
            const sfxVolOut = panel.querySelector("#sfx-volume-val");
            sfxVol.oninput = () => {
                const v = parseFloat(sfxVol.value);
                G.sfxVolume = v;
                sfxVolOut.textContent = Math.round(v * 100) + "%";
            };

            // Close button
            panel.querySelector(".sound-close").onclick = () => panel.classList.add("hidden");

            // Close on outside click
            document.addEventListener("click", (e) => {
                if (!panel.contains(e.target) && e.target !== $("btn-sound")) {
                    panel.classList.add("hidden");
                }
            });

            return panel;
        }

        $("btn-sound").onclick = (e) => {
            e.stopPropagation();
            const panel = createSoundPanel();
            panel.classList.toggle("hidden");
            if (!panel.classList.contains("hidden")) {
                // Position near button
                const btn = $("btn-sound");
                const rect = btn.getBoundingClientRect();
                panel.style.top = (rect.bottom + 8) + "px";
                panel.style.right = (window.innerWidth - rect.right) + "px";
                // Update controls to current state
                panel.querySelector("#sound-master").checked = G.soundOn;
                panel.querySelector("#music-volume").value = G.bgMusic.volume;
                panel.querySelector("#music-volume-val").textContent = Math.round(G.bgMusic.volume * 100) + "%";
                panel.querySelector("#sfx-volume").value = G.sfxVolume;
                panel.querySelector("#sfx-volume-val").textContent = Math.round(G.sfxVolume * 100) + "%";
            }
        };
        $("btn-new").onclick = () => { $("setup-modal").classList.remove("hidden"); };

        // Setup modal dismiss buttons (header × and footer Cancel)
        const hideSetup = () => {
            const modal = $("setup-modal");
            if (modal) modal.classList.add("hidden");
            const err = $("setup-error");
            if (err) err.textContent = "";
        };
        if ($("btn-close-setup")) $("btn-close-setup").onclick = hideSetup;
        if ($("btn-cancel-setup")) $("btn-cancel-setup").onclick = hideSetup;

        // Chat wiring
        const chatPanel = $("chat-panel");
        const chatClose = $("btn-close-chat");
        const chatInput = $("chat-input");
        const chatSend = $("btn-chat-send");
        if (chatClose && chatPanel) {
            chatClose.onclick = () => {
                chatPanel.classList.add("hidden");
            };
        }
        if (chatSend && chatInput) {
            const sendChat = () => {
                const text = chatInput.value.trim();
                if (!text || !G.code) return;
                G.api.sendRoom(G.code, "CHAT", G.myName, { text });
                chatInput.value = "";
            };
            chatSend.onclick = sendChat;
            chatInput.addEventListener("keydown", e => {
                if (e.key === "Enter") { e.preventDefault(); sendChat(); }
            });
        }

        // QR Scanner button for joining rooms
        if ($("btn-scan-qr")) {
            $("btn-scan-qr").onclick = () => startQrScanner();
        }
        if ($("btn-stop-qr-scan")) {
            $("btn-stop-qr-scan").onclick = () => stopQrScanner();
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
        // Always rebuild from the state whose map is on screen (G.drawnState) and
        // never straight from G.lastState: a resize can land while a move is still
        // animating, and G.lastState may already carry a reshuffled map that the
        // in-flight path was not computed on.
        const rebuild = () => {
            const st = G.drawnState || G.lastState;
            if (!st) return;
            G.board.build(st);
            markBuilt(st);
        };
        window.addEventListener("resize", () => {
            clearTimeout(t);
            t = setTimeout(() => {
                if (!G.lastState) return;
                if (!G.busy) rebuild();
                else t = setTimeout(rebuild, 1500);
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

        // Resume AudioContext on first user interaction (for background music)
        let audioResumed = false;
        function resumeAudioOnInteraction() {
            if (audioResumed) return;
            audioResumed = true;
            ensureAudio();
            if (G.audio && G.audio.state === "suspended") {
                G.audio.resume().then(() => {
                    if (G.soundOn && !G.bgMusic.playing) startBgMusic();
                });
            } else if (G.soundOn && !G.bgMusic.playing) {
                startBgMusic();
            }
            document.removeEventListener("click", resumeAudioOnInteraction);
            document.removeEventListener("keydown", resumeAudioOnInteraction);
        }
        document.addEventListener("click", resumeAudioOnInteraction, { once: true });
        document.addEventListener("keydown", resumeAudioOnInteraction, { once: true });

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
