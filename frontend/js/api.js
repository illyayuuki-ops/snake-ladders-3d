/* ============================================================
   api.js — minimal REST client for local-only mode
   ============================================================ */
(function (global) {
    "use strict";

    function enc(s) { return encodeURIComponent(s); }

    class Api {
        constructor(base) {
            const baseOrigin = (location.protocol === 'file:' ? 'http://localhost:8080' : `${location.protocol}//${location.host}`);
            this.base = base || baseOrigin + '/api';
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
        leaderboard(by, limit) { return this.get("/leaderboard?by=" + (by || "winrate") + "&limit=" + (limit || 10)); }
    }

    global.Api = Api;
})(window);
