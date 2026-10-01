/* ============================================================
   board25d.js — 2.5D board renderer.
   Renders one of the 20 gallery boards as a flat, tilted photo
   with the same SVG snakes/ladders and standing tokens that
   Board3D uses, matching the Board3D interface so game.js can
   swap between them.
   ============================================================ */
(function (global) {
    "use strict";

    const COLS = 10;

    class Board25D {
        constructor(boardEl) {
            // Delegate all camera/layout plumbing to the existing Board3D
            // implementation, then layer our flat board image on top.
            if (typeof Board3D === "function") {
                this._b3d = new Board3D(boardEl);
                Object.assign(this, this._b3d);
                this.el = boardEl;
                this.tile = this._b3d.tile;
            } else {
                this.el = boardEl;
                this.tile = 68; this.size = 100; this.rows = 10;
                this.tokens = {}; this.colorOf = {};
                this.particles = new (global.ParticleSystem || function () {
                    this.burst = function () {};
                })(boardEl);
                this.tiltX = 58; this.tiltY = 0; this.zoom = 1;
                this._applyCamera();
            }
            this.surface = null;
            this.layoutIndex = 0;
            window.addEventListener("resize", this._onResize = () => {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = setTimeout(() => {
                    if (this._lastState) this.build(this._lastState);
                }, 150);
            });
            window.addEventListener("orientationchange", this._onResize);
        }

        /* ---------- layout helpers (delegate to Board3D when present) ---------- */
        _fit(viewW, viewH) {
            if (this._b3d && this._b3d._fit) {
                this._b3d._fit(viewW, viewH);
                this.tile = this._b3d.tile;
            } else {
                const availH = viewH - 144;
                const maxTile = Math.min((viewW - 32) / COLS, availH / this.rows, 120);
                this.tile = Math.max(24, Math.floor(maxTile));
                const root = this.el.parentElement;
                root.style.setProperty("--board-w", (this.tile * COLS) + "px");
                root.style.setProperty("--board-h", (this.tile * this.rows) + "px");
                root.style.setProperty("--tile", this.tile + "px");
            }
        }
        tilePos(t) {
            if (this._b3d && this._b3d.tilePos) return this._b3d.tilePos(t);
            if (t <= 0) t = 1;
            const idx = t - 1;
            const rowFromBottom = Math.floor(idx / COLS);
            const inRow = idx % COLS;
            const col = (rowFromBottom % 2 === 0) ? inRow : (COLS - 1 - inRow);
            return { x: col * this.tile, y: (this.rows - 1 - rowFromBottom) * this.tile };
        }
        tileCenter(t) {
            const p = this.tilePos(t);
            return { x: p.x + this.tile / 2, y: p.y + this.tile / 2 };
        }

        /* ---------- camera (delegate to Board3D) ---------- */
        _applyCamera() {
            if (this._b3d) this._b3d._applyCamera();
        }
        setCamera(tiltX, tiltY, zoom) {
            if (this._b3d && this._b3d.setCamera) {
                this._b3d.setCamera(tiltX, tiltY, zoom);
                this.tiltX = this._b3d.tiltX; this.tiltY = this._b3d.tiltY; this.zoom = this._b3d.zoom;
            } else {
                this.tiltX = Math.max(22, Math.min(82, tiltX == null ? this.tiltX : tiltX));
                this.tiltY = tiltY == null ? this.tiltY : tiltY;
                this.zoom = Math.max(0.55, Math.min(1.7, zoom == null ? this.zoom : zoom));
                this._applyCamera();
            }
        }

        /* ---------- board image ---------- */
        _imageForIndex(idx) {
            const n = String((idx || 0) + 1).padStart(2, "0");
            return "/assets/boards25d/snakes-and-ladders-board-" + n + ".jpg";
        }

        _buildBoardImage(state) {
            const idx = (state && typeof state.layoutIndex === "number") ? state.layoutIndex
                : (this.layoutIndex || 0);
            this.layoutIndex = idx;

            if (!this.surface) {
                this.surface = document.createElement("div");
                this.surface.className = "bd-surface";
                this.surface.style.cssText = `
                    position: absolute; inset: 0;
                    background: radial-gradient(ellipse at 30% 70%, rgba(0,0,0,0.08), transparent 70%),
                                url('${this._imageForIndex(idx)}');
                    background-size: cover; background-position: center;
                    border-radius: 14px; z-index: 0; pointer-events: none;
                `;
                this.el.appendChild(this.surface);
            }
            this.surface.style.backgroundImage = "radial-gradient(ellipse at 30% 70%, rgba(0,0,0,0.08), transparent 70%), url('" + this._imageForIndex(idx) + "')";
        }

        /* ---------- build ---------- */
        build(state) {
            this.size = state.size || 100;
            this.rows = Math.ceil(this.size / COLS);
            this._lastState = state;
            this._fit(window.innerWidth, window.innerHeight);

            // Wipe the previous board (surface + svg + tokens).
            this.el.innerHTML = "";
            this.tokens = {}; this.colorOf = {};
            this.surface = null;

            this._buildBoardImage(state);
            if (this._b3d) this._b3d.svg = null;
            this._buildSvg();
            this._buildConnectors(state);
            this._buildTokens(state);

            this._applyCamera();
        }

        /* Reuse Board3D's SVG + connector + token machinery. */
        _buildSvg() {
            if (this._b3d && this._b3d._buildSvg) {
                // Re-create an SVG owned by this instance so methods resolve.
                const SVGNS = "http://www.w3.org/2000/svg";
                const w = this.tile * COLS, h = this.tile * this.rows;
                const svg = document.createElementNS(SVGNS, "svg");
                svg.setAttribute("class", "overlay-svg");
                svg.setAttribute("viewBox", "0 0 " + w + " " + h);
                svg.setAttribute("preserveAspectRatio", "none");
                svg.style.width = w + "px"; svg.style.height = h + "px";
                this.svg = svg;
                this.el.appendChild(svg);
                svg.appendChild(this._b3d._defsNode());
                // Keep Board3D's drawing helpers pointing at our overlay.
                this._b3d.svg = svg;
            } else if (this._b3d) {
                this._b3d._buildSvg();
                this.svg = this._b3d.svg;
            }
        }
        _buildConnectors(state) {
            if (this._b3d) this._b3d._buildConnectors && this._b3d._buildConnectors(state, this.svg ? this.svg : this._b3d.svg);
        }
        _buildTokens(state) {
            if (this._b3d) this._b3d._buildTokens && this._b3d._buildTokens(state);
            else this._buildTokensLocal(state);
        }

        _buildTokensLocal(state) {
            (state.players || []).forEach((p, i) => {
                this.colorOf[p.name] = p.color || "#ef4444";
                this._makeToken(p.name, p.color, i, state.players.length);
                this.placeToken(p.name, p.position, false);
            });
        }
        _makeToken(name, color, index, total) {
            if (this._b3d && this._b3d._makeToken) {
                this._b3d._makeToken(name, color, index, total);
                this.tokens = this._b3d.tokens;
                this.colorOf = this._b3d.colorOf;
            } else {
                const el = document.createElement("div");
                el.className = "token token-" + (index + 1);
                el.style.setProperty("--c", color || "#ef4444");
                el.style.setProperty("--tile", this.tile + "px");
                const pawn = document.createElement("div");
                pawn.className = "pawn";
                const glow = document.createElement("div"); glow.className = "token-glow";
                glow.style.setProperty("--c", color || "#ef4444");
                const tag = document.createElement("div"); tag.className = "tag"; tag.textContent = name;
                el.appendChild(glow); el.appendChild(pawn); el.appendChild(tag);
                this.el.appendChild(el);
                this.tokens[name] = el; el._idx = index; el._total = total;
            }
        }

        placeToken(name, tile, animate) {
            if (this._b3d && this._b3d.placeToken) this._b3d.placeToken(name, tile, animate);
            else if (this.tokens[name]) {
                const c = this.tileCenter(tile);
                const half = this.tile * 0.25;
                const el = this.tokens[name];
                const ox = ((el._idx % 2) ? 7 : -7);
                const oy = (el._idx < 2 ? -4 : 6);
                if (!animate) { const prev = el.style.transition; el.style.transition = "none"; }
                el.style.left = (c.x - half + ox) + "px";
                el.style.top = (c.y - half + oy) + "px";
                if (!animate) { void el.offsetWidth; el.style.transition = ""; }
            }
        }

        moveAlong(name, path, finalTile, kind, done) {
            if (this._b3d && this._b3d.moveAlong) this._b3d.moveAlong(name, path, finalTile, kind, done);
            else if (this.tokens[name]) {
                // Fallback: just place at final tile.
                this.placeToken(name, finalTile, true);
                if (done) setTimeout(done, 180);
            } else if (done) done();
        }

        celebrateWin(name) {
            if (this._b3d && this._b3d.celebrateWin) this._b3d.celebrateWin(name);
        }

        powerupCollect(name, type) {
            if (this._b3d && this._b3d.powerupCollect) this._b3d.powerupCollect(name, type);
        }

        setCurrent(name) {
            if (this._b3d && this._b3d.setCurrent) this._b3d.setCurrent(name);
            else {
                Object.values(this.tokens).forEach(t => t.classList.remove("current"));
                if (name && this.tokens[name]) this.tokens[name].classList.add("current");
            }
        }

        setWin(name) {
            if (this._b3d && this._b3d.setWin) this._b3d.setWin(name);
            else if (this.tokens[name]) {
                this.tokens[name].classList.add("win");
                this.celebrateWin(name);
            }
        }

        respawnBoard(state) {
            this._buildBoardImage(state);
            if (this._b3d && this._b3d.respawnBoard) this._b3d.respawnBoard(state);
        }

        setTheme(theme) {
            if (this._b3d) this._b3d.setTheme && this._b3d.setTheme(theme);
        }

        dispose() {
            if (this._onResize) {
                window.removeEventListener("resize", this._onResize);
                window.removeEventListener("orientationchange", this._onResize);
            }
            if (this._b3d && this._b3d._onResize) {
                window.removeEventListener("resize", this._b3d._onResize);
                window.removeEventListener("orientationchange", this._b3d._onResize);
            }
        }
    }

    global.Board25D = Board25D;
})(window);
