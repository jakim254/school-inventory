const CACHE_NAME = 'inventory-v1';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './manifest.json',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/dexie/dist/dexie.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});