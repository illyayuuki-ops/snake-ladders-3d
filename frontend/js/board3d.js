/* ============================================================
   board3d.js — renders the 3D board, ladders, snakes & tokens
   and animates token movement. Pure CSS 3D transforms.
   ============================================================ */
(function (global) {
    "use strict";

    const COLS = 10;
    const SVGNS = "http://www.w3.org/2000/svg";

    // ===== Particle System =====
    class ParticleSystem {
        constructor(boardEl) {
            this.boardEl = boardEl;
            this.particles = [];
            this.container = document.createElement("div");
            this.container.className = "particle-container";
            this.container.style.cssText = `
                position: absolute; inset: 0; pointer-events: none; z-index: 50;
                transform-style: preserve-3d;
            `;
            boardEl.appendChild(this.container);
        }

        addParticle(x, y, z, options = {}) {
            const p = document.createElement("div");
            const size = options.size || 8;
            const color = options.color || "#fde68a";
            const life = options.life || 800;
            const gravity = options.gravity ?? 0.3;
            const velocity = options.velocity || { x: 0, y: -4, z: 0 };

            p.style.cssText = `
                position: absolute; left: ${x}px; top: ${y}px;
                width: ${size}px; height: ${size}px;
                border-radius: 50%;
                background: ${color};
                box-shadow: 0 0 ${size}px ${color};
                transform: translateZ(${z}px) translate3d(0,0,0);
                opacity: 1; transition: transform ${life}ms ease-out, opacity ${life}ms ease-out;
                pointer-events: none;
            `;

            this.container.appendChild(p);
            this.particles.push({ el: p, x, y, z, velocity, gravity, life, born: performance.now() });

            // Animation
            const animate = () => {
                const elapsed = performance.now() - this.particles.find(pr => pr.el === p)?.born || 0;
                if (elapsed >= life) {
                    p.remove();
                    this.particles = this.particles.filter(pr => pr.el !== p);
                    return;
                }
                const progress = elapsed / life;
                const part = this.particles.find(pr => pr.el === p);
                if (!part) return;
                part.velocity.y += part.gravity;
                part.x += part.velocity.x;
                part.y += part.velocity.y;
                part.z += part.velocity.z;
                p.style.transform = `translateZ(${part.z}px) translate3d(${part.x}px, ${part.y}px, 0)`;
                p.style.opacity = 1 - progress;
                requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);

            // Cleanup
            setTimeout(() => { if (p.parentNode) p.remove(); }, life + 50);
        }

        burst(x, y, z, count, color, options = {}) {
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
                const speed = options.speed || (2 + Math.random() * 3);
                this.addParticle(x, y, z, {
                    color,
                    size: options.size || (4 + Math.random() * 8),
                    velocity: {
                        x: Math.cos(angle) * speed,
                        y: Math.sin(angle) * speed - (options.upward ? 3 : 0),
                        z: (Math.random() - 0.5) * 2
                    },
                    gravity: options.gravity ?? 0.2,
                    life: options.life || 600
                });
            }
        }

        clear() {
            this.particles.forEach(p => p.el.remove());
            this.particles = [];
        }
    }

    // ===== Board3D Class =====
    class Board3D {
        constructor(boardEl) {
            this.el = boardEl;
            this.tile = 60;
            this.size = 100;
            this.rows = 10;
            this.tokens = {};
            this.colorOf = {};
            this.tiltX = 58; this.tiltY = 0; this.zoom = 1;
            this.particles = new ParticleSystem(boardEl);
            this.theme = "classic"; // classic, neon, dark, pastel
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
            if (t <= 0) t = 1;
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

            // tiles with enhanced visuals
            for (let t = 1; t <= this.size; t++) {
                const p = this.tilePos(t);
                const d = document.createElement("div");
                d.className = "tile " + ((t % 2 === 0) ? "dark" : "light");
                d.style.left = p.x + "px";
                d.style.top = p.y + "px";
                d.dataset.tile = t;
                if (t === 1) d.classList.add("start");
                if (t === this.size) d.classList.add("goal");
                d.innerHTML = `
                    <span class="num">${t}</span>
                    <div class="tile-glow"></div>
                    <div class="tile-reflection"></div>
                `;
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
            for (let t = 1; t <= this.size; t++) {
                const tile = this.el.querySelector('.tile[data-tile="' + t + '"]');
                if (!tile) continue;
                if (ladders[t] != null) {
                    tile.classList.add("has-ladder");
                    this._addBadge(tile, "🪜", "ladder-badge");
                }
                if (snakes[t] != null) {
                    tile.classList.add("has-snake");
                    this._addBadge(tile, "🐍", "snake-badge");
                }
                if (powerups[t]) {
                    tile.classList.add("has-powerup");
                    this._addBadge(tile, "⚡", "powerup-badge");
                }
            }
        }

        _addBadge(tile, emoji, cls) {
            const existing = tile.querySelector("." + cls);
            if (existing) return;
            const b = document.createElement("span");
            b.className = "tile-badge " + cls;
            b.textContent = emoji;
            tile.appendChild(b);
        }

        _buildSvg() {
            const w = this.tile * COLS, h = this.tile * this.rows;
            const svg = document.createElementNS(SVGNS, "svg");
            svg.setAttribute("class", "overlay-svg");
            svg.setAttribute("viewBox", "0 0 " + w + " " + h);
            svg.setAttribute("preserveAspectRatio", "none");
            svg.style.width = w + "px";
            svg.style.height = h + "px";
            this.svg = svg;
            this.el.appendChild(svg);
            svg.appendChild(this._defsNode());
        }

        _defsNode() {
            const defs = this._svgEl("defs", {});
            const grad = (id, x2, y2, stops) => {
                const g = this._svgEl("linearGradient", { id: id, x1: "0", y1: "0", x2: x2, y2: y2 });
                stops.forEach(([offset, color]) => g.appendChild(this._svgEl("stop", { offset: offset, "stop-color": color })));
                defs.appendChild(g);
            };
            // Enhanced gradients - fire theme for snakes
            grad("snakeGrad", "1", "1", [["0", "#ffdd00"], ["0.2", "#ff8800"], ["0.5", "#ff4400"], ["0.8", "#cc0000"], ["1", "#8b0000"]]);
            grad("ladderGrad", "0", "1", [["0", "#ffeaa7"], ["0.5", "#fdcb6e"], ["1", "#e17055"]]);
            grad("tileGlow", "0", "1", [["0", "rgba(255,255,255,0.1)"], ["1", "rgba(255,255,255,0)"]]);
            grad("powerupGlow", "0", "1", [["0", "#ffeaa7"], ["1", "#fdcb6e"]]);
            return defs;
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

            // Rails with glow
            const railStyle = `stroke: url(#ladderGrad); stroke-linecap: round; filter: drop-shadow(0 0 4px #fdcb6e);`;
            g.appendChild(this._svgEl("line", {
                x1: a.x + px * off, y1: a.y + py * off,
                x2: b.x + px * off, y2: b.y + py * off,
                "class": "rail", "stroke-width": Math.max(5, this.tile * 0.1), style: railStyle
            }));
            g.appendChild(this._svgEl("line", {
                x1: a.x - px * off, y1: a.y - py * off,
                x2: b.x - px * off, y2: b.y - py * off,
                "class": "rail", "stroke-width": Math.max(5, this.tile * 0.1), style: railStyle
            }));

            // Rungs
            const n = Math.max(3, Math.round(len / (this.tile * 0.42)));
            for (let i = 1; i < n; i++) {
                const t = i / n, cx = a.x + dx * t, cy = a.y + dy * t;
                g.appendChild(this._svgEl("line", {
                    x1: cx + px * off, y1: cy + py * off,
                    x2: cx - px * off, y2: cy - py * off,
                    "class": "rung", "stroke-width": Math.max(4, this.tile * 0.08),
                    style: "stroke: #fdcb6e; stroke-linecap: round; filter: drop-shadow(0 0 3px #fdcb6e);"
                }));
            }

            // Ladder end caps
            [a, b].forEach(p => {
                g.appendChild(this._svgEl("circle", {
                    cx: p.x + px * off, cy: p.y + py * off,
                    r: this.tile * 0.08, fill: "url(#ladderGrad)", stroke: "#e17055", "stroke-width": 2
                }));
                g.appendChild(this._svgEl("circle", {
                    cx: p.x - px * off, cy: p.y - py * off,
                    r: this.tile * 0.08, fill: "url(#ladderGrad)", stroke: "#e17055", "stroke-width": 2
                }));
            });

            this.svg.appendChild(g);
        }

        drawSnake(a, b, idx) {
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len, px = -uy, py = ux;
            const curve = (idx % 2 ? 1 : -1) * len * 0.22;
            const cx = (a.x + b.x) / 2 + px * curve, cy = (a.y + b.y) / 2 + py * curve;
            const d = "M " + a.x + " " + a.y + " Q " + cx + " " + cy + " " + b.x + " " + b.y;
            const g = this._svgEl("g", { "class": "snake-g" });

            // Shadow
            g.appendChild(this._svgEl("path", {
                d: d, "class": "snake-shadow",
                "stroke-width": this.tile * 0.35
            }));

            // Body with gradient
            g.appendChild(this._svgEl("path", {
                d: d, "class": "snake-body",
                "stroke-width": this.tile * 0.28,
                style: "filter: drop-shadow(0 0 6px #ff6b6b);"
            }));

            // Head - use fire snake image anchored at point a (head tile center)
            const headSize = this.tile * 0.55;
            const headImg = this._svgEl("image", {
                href: "/assets/snake-head.png",
                x: a.x - headSize / 2,
                y: a.y - headSize / 2,
                width: headSize,
                height: headSize,
                preserveAspectRatio: "xMidYMid meet"
            });
            g.appendChild(headImg);

            // Eyes with pupils (positioned relative to head center)
            [[0.09, 0.09], [-0.09, 0.09]].forEach(([ex, ey]) => {
                const eyeGroup = this._svgEl("g");
                eyeGroup.appendChild(this._svgEl("circle", {
                    cx: a.x + px * this.tile * ex, cy: a.y + py * this.tile * ey,
                    r: this.tile * 0.06, fill: "#fff", class: "eye"
                }));
                eyeGroup.appendChild(this._svgEl("circle", {
                    cx: a.x + px * this.tile * ex, cy: a.y + py * this.tile * ey,
                    r: this.tile * 0.025, fill: "#111", class: "pupil"
                }));
                g.appendChild(eyeGroup);
            });

            // Tongue
            g.appendChild(this._svgEl("path", {
                d: "M " + a.x + " " + a.y + " l " + (ux * this.tile * 0.25) + " " + (uy * this.tile * 0.25),
                class: "tongue", "stroke-width": Math.max(2, this.tile * 0.05)
            }));

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
            el.className = "token token-" + (index + 1);
            el.style.setProperty("--c", color || "#ef4444");
            el.style.setProperty("--tile", this.tile + "px");

            const pawn = document.createElement("div");
            pawn.className = "pawn";
            // Pawn image is set via CSS per token-N class

            // Add glow ring
            const glow = document.createElement("div");
            glow.className = "token-glow";
            glow.style.setProperty("--c", color || "#ef4444");

            const tag = document.createElement("div");
            tag.className = "tag";
            tag.textContent = name;

            el.appendChild(glow);
            el.appendChild(pawn);
            el.appendChild(tag);
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
            const step = 180;
            let i = 1;

            // Add trail effect
            const trail = document.createElement("div");
            trail.className = "token-trail";
            trail.style.setProperty("--c", this.colorOf[name] || "#ef4444");
            this.el.appendChild(trail);

            el.classList.add("moving");

            // Particle burst at start
            const startPos = this.tileCenter(path[0] || 1);
            this.particles.burst(startPos.x, startPos.y, this.tile * 0.5, 8,
                kind === "SLIDE" ? "#ff6b6b" : (kind === "CLIMB" ? "#ffeaa7" : this.colorOf[name] || "#ef4444"),
                { speed: 3, life: 400, upward: kind === "CLIMB" }
            );

            const next = () => {
                if (i < path.length) {
                    this.placeToken(name, path[i], true);

                    // Trail follows
                    const pos = this.tileCenter(path[i]);
                    trail.style.left = (pos.x - this.tile * 0.25) + "px";
                    trail.style.top = (pos.y - this.tile * 0.25) + "px";

                    i++;
                    setTimeout(next, step);
                } else if (finalTile != null && finalTile !== path[path.length - 1]) {
                    // ladder climb / snake slide jump
                    el.classList.remove("moving");
                    el.classList.add(kind === "SLIDE" ? "sliding" : "climbing");
                    trail.remove();

                    // Particle burst at transition
                    const pos = this.tileCenter(path[path.length - 1]);
                    this.particles.burst(pos.x, pos.y, this.tile * 0.6, 12,
                        kind === "SLIDE" ? "#ff6b6b" : "#ffeaa7",
                        { speed: 5, life: 500, upward: kind === "CLIMB", gravity: 0.4 }
                    );

                    this.placeToken(name, finalTile, true);
                    setTimeout(() => {
                        el.classList.remove("sliding", "climbing");
                        if (done) done();
                    }, 360);
                } else {
                    trail.remove();
                    el.classList.remove("moving");
                    if (done) done();
                }
            };
            setTimeout(next, step * 0.3);
        }

        /* Particle effects for special events */
        celebrateWin(name) {
            const token = this.tokens[name]; if (!token) return;
            const rect = token.getBoundingClientRect();
            const boardRect = this.el.getBoundingClientRect();
            const x = rect.left - boardRect.left + rect.width / 2;
            const y = rect.top - boardRect.top + rect.height / 2;
            const colors = ["#ffeaa7", "#74b9ff", "#fd79a8", "#a29bfe", "#55efc4", "#ffeaa7"];
            colors.forEach((c, i) => {
                setTimeout(() => {
                    this.particles.burst(x, y, this.tile, 20, c, { speed: 6, life: 1000, gravity: 0.15 });
                }, i * 100);
            });
        }

        powerupCollect(name, type) {
            const token = this.tokens[name]; if (!token) return;
            const rect = token.getBoundingClientRect();
            const boardRect = this.el.getBoundingClientRect();
            const x = rect.left - boardRect.left + rect.width / 2;
            const y = rect.top - boardRect.top + rect.height / 2;
            const colors = type === "SHIELD" ? ["#74b9ff", "#0984e3"] :
                           type === "DOUBLE" ? ["#ffeaa7", "#fdcb6e"] :
                           ["#fd79a8", "#e84393"];
            this.particles.burst(x, y, this.tile * 0.5, 15, colors[0], { speed: 4, life: 600, upward: true });
        }

        setCurrent(name) {
            Object.values(this.tokens).forEach(t => t.classList.remove("current"));
            if (name && this.tokens[name]) this.tokens[name].classList.add("current");
        }

        setWin(name) {
            if (this.tokens[name]) {
                this.tokens[name].classList.add("win");
                this.celebrateWin(name);
            }
        }

        /* Rebuild connectors for CHAOS reshuffle */
        respawnBoard(state) {
            if (this.svg) {
                while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
                this.svg.appendChild(this._defsNode());
            }
            this.el.querySelectorAll(".tile").forEach(t => {
                t.classList.remove("has-ladder", "has-snake", "has-powerup");
                t.querySelectorAll(".tile-badge").forEach(b => b.remove());
            });
            this._buildConnectors(state);
            this._decorateTiles(state);
        }

        /* Theme support */
        setTheme(theme) {
            this.theme = theme;
            this.el.classList.remove("theme-classic", "theme-neon", "theme-dark", "theme-pastel");
            this.el.classList.add("theme-" + theme);
            // Rebuild connectors with new theme colors
            // (would need state, skip for now)
        }
    }

    global.Board3D = Board3D;
})(window);