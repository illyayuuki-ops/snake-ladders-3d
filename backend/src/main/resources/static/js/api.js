/* ============================================================
    api.js — REST + WebSocket client for local + online multiplayer mode
    ============================================================ */
(function (global) {
    "use strict";

    function enc(s) { return encodeURIComponent(s); }

    class Api {
        constructor(base) {
            const baseOrigin = (location.protocol === 'file:' ? 'http://localhost:8080' : `${location.protocol}//${location.host}`);
            this.base = base || baseOrigin + '/api';
            this.ws = null;
            this.stomp = null;
            this.roomCode = null;
            this.onRoomMessage = null;
            this._onSync = null; // optional callback invoked after a REST re-sync
        }

        async _req(method, url, body) {
            const res = await fetch(this.base + url, {
                method,
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined
            });
            if (!res.ok) {
                let msg = res.status + " " + res.statusText;
                try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
                throw new Error(msg);
            }
            if (res.status === 204) return null;
            return res.json();
        }
        get(url) { return this._req("GET", url); }
        post(url, body) { return this._req("POST", url, body); }

        ensurePlayer(name) { return this.post("/players/ensure", { username: name }); }
        getPlayers() { return this.get("/players"); }
        createPlayer(name) { return this.post("/players", { username: name }); }
        recordMatch(username, mode, variant, won, turns, placement) {
            return this.post("/players/record-match", {
                username, mode, variant, won, turns, placement
            });
        }
        leaderboard(by, limit, me) { return this.get("/leaderboard?by=" + (by || "winrate") + "&limit=" + (limit || 10) + (me ? "&me=" + enc(me) : "")); }
        riddle() { return this.get("/riddle"); }
        searchPlayers(q, limit) { return this.get("/players/search?q=" + enc(q || "") + "&limit=" + (limit || 20)); }

        /* ---------------- online room methods (REST) ---------------- */
        createRoom(username, mode, variant) {
            return this.post("/rooms", { username, mode, variant });
        }
        joinRoom(code, username) {
            return this.post("/rooms/join", { code: code.toUpperCase(), username });
        }
        startRoom(code) {
            return this.post("/rooms/" + enc(code.toUpperCase()) + "/start", {});
        }
        // NOTE: room START is sent over REST to /api/rooms/{code}/start
        // so the backend's authoritative GameService can transition the room to
        // PLAYING and broadcast the shared initial state to every subscriber.

        /* ---------------- WebSocket helpers ---------------- */
        connectWs() {
            return new Promise((resolve) => {
                try {
                    if (typeof SockJS !== 'undefined' && typeof Stomp !== 'undefined') {
                        const socket = new SockJS('/ws');
                        const stomp = Stomp.over(socket);
                        this.stomp = stomp;
                        stomp.connect({}, () => {
                            this.ws = stomp;
                            resolve(true);
                        }, () => {
                            this.ws = null;
                            resolve(false);
                        });
                    } else {
                        this.ws = null;
                        resolve(false);
                    }
                } catch (e) {
                    this.ws = null;
                    resolve(false);
                }
            });
        }

        subscribeRoom(roomCode, onMessage) {
            this.roomCode = roomCode;
            this.onRoomMessage = onMessage || null;
            if (!this.stomp || !this.ws) return;
            try {
                // Subscribe to /topic/room/{code} (slash separator) to match the
                // backend's broadcast destination.
                this.stomp.subscribe('/topic/room/' + roomCode, (msg) => {
                    try {
                        const data = JSON.parse(msg.body);
                        if (this.onRoomMessage) this.onRoomMessage(data);
                    } catch (e) {}
                });
            } catch (e) {}
        }

        /**
         * Send a message to the backend's single WebSocket destination /app/room.
         * The body includes roomCode, type, player, and optional payload.
         * The backend delegates to the authoritative GameSession and broadcasts
         * the resulting GameStateResponse to /topic/room/{code}.
         */
        sendRoom(roomCode, type, player, payload) {
            if (!this.stomp || !this.ws) return;
            try {
                const msg = {
                    roomCode: roomCode,
                    type: String(type).toUpperCase(),
                    player: player || null,
                    payload: payload || null
                };
                this.stomp.send('/app/room', JSON.stringify(msg));
            } catch (e) {}
        }

        /* ---------------- REST re-sync on (re)connect ---------------- */
        async syncRoom(roomCode) {
            try {
                const st = await this.get("/rooms/" + enc(roomCode.toUpperCase()));
                return st || null;
            } catch (e) {
                return null;
            }
        }

        /** Set a callback invoked after a REST re-sync completes. */
        setOnSync(fn) { this._onSync = fn; }

        /** Trigger a REST re-sync for the current room (used on WebSocket reconnect). */
        async _syncStates() {
            if (!this.roomCode) return;
            const st = await this.syncRoom(this.roomCode);
            if (st && this._onSync) {
                try { this._onSync(st); } catch (e) {}
            }
            return st;
        }
    }

    global.Api = Api;
})(window);