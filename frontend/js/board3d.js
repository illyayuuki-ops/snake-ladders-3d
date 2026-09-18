/* ============================================================
   board3d.js — renders the 3D board, ladders, snakes & tokens
   and animates token movement. Pure CSS 3D transforms.
   ============================================================ */
(function (global) {
    "use strict";

    const COLS = 10;
    const SVGNS = "http://www.w3.org/2000/svg";

    class Board3D {
        constructor(boardEl) {
            this.el = boardEl;
            this.tile = 60;
            this.size = 100;
            this.rows = 10;
            this.tokens = {};      // name -> element
            this.colorOf = {};     // name -> hex
            this.tiltX = 58; this.tiltY = 0; this.zoom = 1;
            this._applyCamera();
        }

        /* ---------- camera ---------- */
        _applyCamera() {
            this.el.parentElement.style.setProperty("--tilt-x", this.tiltX + "deg");
            this.el.parentElement.style.setProperty("--tilt-y", this.tiltY + "deg");
            this.el.parentElement.style.setProperty("--zoom", this.zoom);
            const scene = this.el.parentElement;
            const basePerspective = Math.max(window.innerWidth, window.innerHeight) * 0.85;
            scene.style.perspective = basePerspective + "px";
        }
        setCamera(tiltX, tiltY, zoom) {
            if (tiltX != null) this.tiltX = Math.max(22, Math.min(82, tiltX));
            if (tiltY != null) this.tiltY = tiltY;
            if (zoom != null) this.zoom = Math.max(0.55, Math.min(1.7, zoom));
            this._applyCamera();
        }

        /* ---------- layout ---------- */
        _fit(viewW, viewH) {
            const hudTop = viewW <= 680 ? 52 : 84;
            const controlsH = viewW <= 680 ? 60 : 80;
            const pad = 24;
            const availW = viewW - pad;
            const availH = viewH - hudTop - controlsH - pad;
            const rows = Math.max(1, this.rows);
            const maxByW = availW / COLS;
            const maxByH = availH / rows;
            const maxTile = Math.min(maxByW, maxByH, 110);
            this.tile = Math.floor(maxTile);
            const w = this.tile * COLS;
            const h = this.tile * this.rows;
            const root = this.el.parentElement;
            root.style.setProperty("--board-w", w + "px");
            root.style.setProperty("--board-h", h + "px");
            root.style.setProperty("--tile", this.tile + "px");
        }

        tilePos(t) {
            if (t <= 0) t = 1; // start sits on tile 1's cell
            const idx = t - 1;
            const rowFromBottom = Math.floor(idx / COLS);
            const inRow = idx % COLS;
            const col = (rowFromBottom % 2 === 0) ? inRow : (COLS - 1 - inRow);
            const x = col * this.tile;
            const y = (this.rows - 1 - rowFromBottom) * this.tile;
            return { x, y };
        }
        tileCenter(t) {
            const p = this.tilePos(t);
            return { x: p.x + this.tile / 2, y: p.y + this.tile / 2 };
        }

        /* ---------- build ---------- */
        build(state) {
            this.size = state.size || 100;
            this.rows = Math.ceil(this.size / COLS);
            this._fit(window.innerWidth, window.innerHeight);
            this.el.innerHTML = "";
            this.tokens = {}; this.colorOf = {};

            this._buildSvg();

            // tiles
            for (let t = 1; t <= this.size; t++) {
                const p = this.tilePos(t);
                const d = document.createElement("div");
                d.className = "tile " + ((t % 2 === 0) ? "dark" : "light");
                d.style.left = p.x + "px";
                d.style.top = p.y + "px";
                d.dataset.tile = t;
                if (t === 1) d.classList.add("start");
                if (t === this.size) d.classList.add("goal");
                const num = document.createElement("span");
                num.className = "num"; num.textContent = t;
                d.appendChild(num);
                this.el.appendChild(d);
            }

            this._decorateTiles(state);
            this._buildConnectors(state);
            this._buildTokens(state);

            // re-apply camera after size change
            this._applyCamera();
        }

        _decorateTiles(state) {
            const ladders = state.ladders || {}, snakes = state.snakes || {}, powerups = state.powerups || {};
            const isLadderTile = (t) => ladders[t] != null || Object.values(ladders).includes(t);
            const isSnakeTile = (t) => snakes[t] != null || Object.values(snakes).includes(t);
            for (let t = 1; t <= this.size; t++) {
                const tile = this.el.querySelector('.tile[data-tile="' + t + '"]');
                if (!tile) continue;
                let badge = "";
                if (ladders[t] != null) { tile.classList.add("has-ladder"); badge = "🪜"; }
                if (snakes[t] != null) { tile.classList.add("has-snake"); badge = "🐍"; }
                if (powerups[t]) { tile.classList.add("has-powerup"); badge = "⚡"; }
                if (badge) {
                    const b = document.createElement("span");
                    b.className = "tile-badge"; b.textContent = badge;
                    tile.appendChild(b);
                }
            }
        }

        _buildSvg() {
            const w = this.tile * COLS, h = this.tile * this.rows;
            const svg = document.createElementNS(SVGNS, "svg");
            svg.setAttribute("class", "overlay-svg");
            svg.setAttribute("viewBox", "0 0 " + w + " " + h);
            svg.setAttribute("preserveAspectRatio", "none");
            svg.style.width = w + "px";
            svg.style.height = h + "px";
            svg.innerHTML = this._defs();
            this.svg = svg;
            this.el.appendChild(svg);
        }
        _defs() {
            return '<defs></defs>';
        }
        _svgEl(tag, attrs) {
            const e = document.createElementNS(SVGNS, tag);
            for (const k in attrs) e.setAttribute(k, attrs[k]);
            return e;
        }

        _buildConnectors(state) {
            const ladders = state.ladders || {}, snakes = state.snakes || {};
            let i = 0;
            for (const k in ladders) this.drawLadder(this.tileCenter(+k), this.tileCenter(ladders[k]));
            for (const k in snakes) this.drawSnake(this.tileCenter(+k), this.tileCenter(snakes[k]), i++);
        }

        drawLadder(a, b) {
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const w = this.tile * 0.34;
            const g = this._svgEl("g", { "class": "ladder-img-g" });
            const img = this._svgEl("image", {
                href: "/assets/ladder.png",
                x: a.x - w / 2,
                y: a.y - len / 2,
                width: w,
                height: len,
                transform: "rotate(" + angle + " " + a.x + " " + a.y + ")",
                "transform-origin": a.x + " " + a.y,
                preserveAspectRatio: "none"
            });
            g.appendChild(img);
            this.svg.appendChild(g);
        }

        drawSnake(a, b, idx) {
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const w = this.tile * 0.42;
            const g = this._svgEl("g", { "class": "snake-img-g" });
            const img = this._svgEl("image", {
                href: "/assets/snake.png",
                x: a.x - w / 2,
                y: a.y - len / 2,
                width: w,
                height: len,
                transform: "rotate(" + angle + " " + a.x + " " + a.y + ")",
                "transform-origin": a.x + " " + a.y,
                preserveAspectRatio: "none"
            });
            g.appendChild(img);
            this.svg.appendChild(g);
        }

        /* ---------- tokens ---------- */
        _buildTokens(state) {
            state.players.forEach((p, i) => {
                this.colorOf[p.name] = p.color || "#ef4444";
                this._makeToken(p.name, p.color, i, state.players.length);
                this.placeToken(p.name, p.position, false);
            });
        }
        _makeToken(name, color, index, total) {
            const el = document.createElement("div");
            el.className = "token";
            const pawn = document.createElement("img");
            pawn.className = "pawn";
            pawn.src = "/assets/pawn-" + (index + 1) + ".png";
            pawn.alt = name;
            const tag = document.createElement("div"); tag.className = "tag"; tag.textContent = name;
            el.appendChild(pawn); el.appendChild(tag);
            this.el.appendChild(el);
            this.tokens[name] = el;
            el._idx = index; el._total = total;
        }
        placeToken(name, tile, animate) {
            const el = this.tokens[name]; if (!el) return;
            const c = this.tileCenter(tile);
            const half = this.tile * 0.25;
            const ox = ((el._idx % 2) ? 7 : -7);
            const oy = (el._idx < 2 ? -4 : 6);
            if (!animate) { const prev = el.style.transition; el.style.transition = "none"; }
            el.style.left = (c.x - half + ox) + "px";
            el.style.top = (c.y - half + oy) + "px";
            if (!animate) { void el.offsetWidth; el.style.transition = ""; }
        }

        /* step a token along a path then (optional) jump to final tile */
        moveAlong(name, path, finalTile, kind, done) {
            const el = this.tokens[name]; if (!el) { if (done) done(); return; }
            const step = 240;
            let i = 1;
            el.classList.add("moving");
            const next = () => {
                if (i < path.length) {
                    this.placeToken(name, path[i], true);
                    i++;
                    setTimeout(next, step);
                } else if (finalTile != null && finalTile !== path[path.length - 1]) {
                    // ladder climb / snake slide jump
                    el.classList.remove("moving");
                    el.classList.add(kind === "SLIDE" ? "sliding" : "climbing");
                    this.placeToken(name, finalTile, true);
                    setTimeout(() => { el.classList.remove("sliding", "climbing"); if (done) done(); }, 360);
                } else {
                    el.classList.remove("moving");
                    if (done) done();
                }
            };
            setTimeout(next, step * 0.4);
        }

        setCurrent(name) {
            Object.values(this.tokens).forEach(t => t.classList.remove("current"));
            if (name && this.tokens[name]) this.tokens[name].classList.add("current");
        }

        setWin(name) {
            if (this.tokens[name]) this.tokens[name].classList.add("win");
        }

        /* rebuild connectors for CHAOS reshuffle */
        respawnBoard(state) {
            if (this.svg) this.svg.innerHTML = this._defs();
            this._buildConnectors(state);
            // refresh tile badges
            this.el.querySelectorAll(".tile").forEach(t => {
                t.classList.remove("has-ladder", "has-snake", "has-powerup");
                const b = t.querySelector(".tile-badge"); if (b) b.remove();
            });
            this._decorateTiles(state);
        }
    }

    global.Board3D = Board3D;
})(window);
