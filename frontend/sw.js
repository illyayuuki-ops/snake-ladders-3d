/* ============================================================
   sw.js — Service Worker for Snakes & Ladders 3D (PWA)
   Cache-first for app shell; network-first for /api/* and /ws/*
   ============================================================ */
const CACHE_VERSION = 'snl3d-v13';
const CORE_CACHE = CACHE_VERSION + '-core';

// A real, well-formed Response returned whenever a request cannot be
// satisfied (offline + no cache hit). Returning this instead of
// undefined / a rejected promise avoids the
// "Failed to convert value to Response" TypeError in event.respondWith.
const OFFLINE_RESPONSE = new Response('', { status: 503, statusText: 'Offline' });

const APP_SHELL = [
    '/',
    '/index.html',
    '/css/tailwind.css',
    '/css/styles.css',
    '/js/api.js',
    '/js/board3d.js',
    '/js/dice.js',
    '/js/engine.js',
    '/js/game.js',
    '/js/riddles.js',
    '/vendor/sockjs.min.js',
    '/vendor/stomp.min.js',
    '/vendor/qrcode.min.js',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-512-maskable.png',
    '/img/pawns/pawn-1.svg',
    '/img/pawns/pawn-2.svg',
    '/img/pawns/pawn-3.svg',
    '/img/pawns/pawn-4.svg',
    '/images/logo.png',
    '/favicon.ico',
    '/audio/bg-retro.mp3'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CORE_CACHE)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CORE_CACHE && key.startsWith('snl3d-')) {
                        return caches.delete(key);
                    }
                    return null;
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Network-only for API and WebSocket endpoints.
    // Always resolve to a valid Response (never a rejected promise).
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
        event.respondWith(
            fetch(event.request).catch(() => OFFLINE_RESPONSE)
        );
        return;
    }

    // Network-first for navigation (HTML pages) — fresh content when online.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        return caches.open(CORE_CACHE).then((cache) => {
                            cache.put(event.request, response.clone());
                            return response;
                        });
                    }
                    throw new Error('Network response was not ok');
                })
                .catch(() => caches.match(event.request)
                    .then(r => r || caches.match('/index.html'))
                    .catch(() => OFFLINE_RESPONSE))
        );
        return;
    }

    // Cache-first for everything else (CSS, JS, images, fonts).
    // When fetch fails AND there is no cache match, return a real Response
    // (503 Offline) instead of undefined / a rejected promise.
    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        return caches.open(CORE_CACHE).then((cache) => {
                            cache.put(event.request, response.clone());
                            return response;
                        });
                    }
                    return response;
                });
            })
            .catch(() => OFFLINE_RESPONSE)
    );
});
