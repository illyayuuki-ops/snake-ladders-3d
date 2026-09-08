/* ============================================================
   api.js — REST client + WebSocket (SockJS/STOMP) wrapper
   ============================================================ */
(function (global) {
    "use strict";

    function enc(s) { return encodeURIComponent(s); }

    class Api {
        constructor(base) {
            this.base = base || "/api";
            this.stomp = null;
            this.connected = false;
            this._reconnectAttempts = 0;
            this._maxReconnect = 8;
            this._subscribers = new Map();
            this._onSync = null;
        }

        /* ---------------- REST ---------------- */
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
        leaderboard(by, limit) { return this.get("/leaderboard?by=" + (by || "winrate") + "&limit=" + (limit || 10)); }
        createGame(req) { return this.post("/games", req); }
        getGame(code) { return this.get("/games/" + enc(code)); }
        join(code, name, ai) { return this.post("/games/" + enc(code) + "/join?name=" + enc(name) + "&ai=" + !!ai, {}); }
        start(code, player) { return this.post("/games/" + enc(code) + "/start?player=" + enc(player), {}); }
        roll(code, player) { return this.post("/games/" + enc(code) + "/roll?player=" + enc(player), {}); }
        powerup(code, player, type, target) {
            const p = { type }; if (target) p.target = target;
            return this.post("/games/" + enc(code) + "/powerup?player=" + enc(player), p);
        }

        leave(code, player) { return this.post("/games/" + enc(code) + "/leave?player=" + enc(player), {}); }

        /* ---------------- WebSocket ---------------- */
        connectWs() {
            return new Promise((resolve, reject) => {
                if (this.connected) return resolve();
                try {
                    const sock = new SockJS("/ws");
                    this.stomp = Stomp.over(sock);
                    this.stomp.debug = null;
                    this.stomp.connect({},
                        () => {
                            this.connected = true;
                            this._reconnectAttempts = 0;
                            this._resubscribeAll();
                            this._syncStates();
                            resolve();
                        },
                        (err) => {
                            this.connected = false;
                            this._scheduleReconnect();
                            reject(err);
                        });
                } catch (e) { reject(e); }
            });
        }

        _syncStates() {
            this._subscribers.forEach((_, code) => {
                this.getGame(code).then(st => {
                    this._onSync && this._onSync(code, st);
                }).catch(() => {});
            });
        }

        _scheduleReconnect() {
            if (this._reconnectAttempts >= this._maxReconnect) return;
            const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
            this._reconnectAttempts++;
            setTimeout(() => this.connectWs().catch(() => {}), delay);
        }

        subscribeRoom(code, onMessage) {
            const key = code;
            this._subscribers.set(key, onMessage);
            if (!this.stomp) return;
            this.stomp.subscribe("/topic/room/" + code, (msg) => {
                try { onMessage(JSON.parse(msg.body)); } catch (e) { console.warn("ws parse", e); }
            });
        }

        _resubscribeAll() {
            if (!this.stomp) return;
            this._subscribers.forEach((onMessage, code) => {
                this.stomp.subscribe("/topic/room/" + code, (msg) => {
                    try { onMessage(JSON.parse(msg.body)); } catch (e) { console.warn("ws parse", e); }
                });
            });
        }

        sendRoom(code, type, player, payload) {
            if (!this.stomp || !this.connected) return false;
            this.stomp.send("/app/room", {}, JSON.stringify({ type, roomCode: code, player, payload: payload || {} }));
            return true;
        }
    }

    global.Api = Api;
})(window);
