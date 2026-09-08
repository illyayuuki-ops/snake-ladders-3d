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
            return '<defs>' +
                '<linearGradient id="snakeGrad" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fb7185"/><stop offset="0.5" stop-color="#ef4444"/><stop offset="1" stop-color="#b91c1c"/></linearGradient>' +
                '<linearGradient id="ladderGrad" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#d97706"/></linearGradient>' +
                '</defs>';
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
            const ux = dx / len, uy = dy / len, px = -uy, py = ux;
            const off = this.tile * 0.17;
            const g = this._svgEl("g", { "class": "ladder-g" });
            g.appendChild(this._svgEl("line", { x1: a.x + px * off, y1: a.y + py * off, x2: b.x + px * off, y2: b.y + py * off, "class": "rail", "stroke-width": Math.max(4, this.tile * 0.09) }));
            g.appendChild(this._svgEl("line", { x1: a.x - px * off, y1: a.y - py * off, x2: b.x - px * off, y2: b.y - py * off, "class": "rail", "stroke-width": Math.max(4, this.tile * 0.09) }));
            const n = Math.max(3, Math.round(len / (this.tile * 0.42)));
            for (let i = 1; i < n; i++) {
                const t = i / n, cx = a.x + dx * t, cy = a.y + dy * t;
                g.appendChild(this._svgEl("line", { x1: cx + px * off, y1: cy + py * off, x2: cx - px * off, y2: cy - py * off, "class": "rung", "stroke-width": Math.max(3, this.tile * 0.07) }));
            }
            this.svg.appendChild(g);
        }

        drawSnake(a, b, idx) {
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len, px = -uy, py = ux;
            const curve = (idx % 2 ? 1 : -1) * len * 0.22;
            const cx = (a.x + b.x) / 2 + px * curve, cy = (a.y + b.y) / 2 + py * curve;
            const d = "M " + a.x + " " + a.y + " Q " + cx + " " + cy + " " + b.x + " " + b.y;
            const g = this._svgEl("g", { "class": "snake-g" });
            g.appendChild(this._svgEl("path", { d: d, "class": "snake-shadow", "stroke-width": this.tile * 0.32 }));
            g.appendChild(this._svgEl("path", { d: d, "class": "snake-body", "stroke-width": this.tile * 0.26 }));
            g.appendChild(this._svgEl("circle", { cx: a.x, cy: a.y, r: this.tile * 0.2, "class": "snake-head" }));
            g.appendChild(this._svgEl("circle", { cx: a.x + px * this.tile * 0.09, cy: a.y + py * this.tile * 0.09, r: this.tile * 0.05, "class": "eye" }));
            g.appendChild(this._svgEl("circle", { cx: a.x - px * this.tile * 0.09, cy: a.y - py * this.tile * 0.09, r: this.tile * 0.05, "class": "eye" }));
            g.appendChild(this._svgEl("circle", { cx: a.x + px * this.tile * 0.09, cy: a.y + py * this.tile * 0.09, r: this.tile * 0.022, "class": "pupil" }));
            g.appendChild(this._svgEl("circle", { cx: a.x - px * this.tile * 0.09, cy: a.y - py * this.tile * 0.09, r: this.tile * 0.022, "class": "pupil" }));
            g.appendChild(this._svgEl("path", { d: "M " + a.x + " " + a.y + " l " + (ux * this.tile * 0.22) + " " + (uy * this.tile * 0.22), "class": "tongue", "stroke-width": Math.max(2, this.tile * 0.04) }));
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
            el.style.setProperty("--c", color || "#ef4444");
            const pawn = document.createElement("div"); pawn.className = "pawn";
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
