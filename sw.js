// sw.js - Service Worker для офлайн-режима
const CACHE_NAME = 'chess-offline-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/chess-logic.js',
  '/js/firebase-config.js',
  'https://code.jquery.com/jquery-3.5.1.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
  'https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js'
];

// Установка Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Перехват запросов
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Возвращаем из кэша, если есть
        if (response) {
          return response;
        }
        // Иначе загружаем из сети
        return fetch(event.request);
      })
  );
});

// Обновление кэша
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});