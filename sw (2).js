/* L'EXPERT — service worker (version fichier unique).
   L'application entière (écrans, moteur Nexus I, planificateur) est dans index.html : c'est le seul fichier indispensable
   au fonctionnement hors connexion. Le numéro de version est généré à partir du contenu de index.html : ne pas l'écrire à la main.
   Recette : « v » + 11 premiers caractères de sha256(index.html), soit  sha256sum index.html | cut -c1-11 .  À recalculer après toute modification de index.html.
   Le service worker ne calcule rien. */
'use strict';
const APP_PREFIX = 'lexpert-';
const CACHE_VERSION = 'v5347954b0b9';
const CACHE_NAME = APP_PREFIX + CACHE_VERSION;
/* Indispensable : sans eux l'installation échoue (jamais de demi-cache). */
const REQUIRED_URLS = ['./', './index.html'];
/* Facultatif : manifeste et icônes (déjà sur GitHub). S'ils manquent, l'application hors connexion fonctionne quand même. */
const OPTIONAL_URLS = ['./manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
/* Anciennes adresses des écrans (version à plusieurs fichiers) -> écran correspondant dans index.html. */
const LEGACY_PAGES = ['nouveau-projet', 'mes-projets', 'resultats', 'conseiller', 'guide', 'dimensionnement', 'simulation'];

/* « cache: reload » : on récupère les fichiers sur le serveur, jamais dans le cache HTTP du navigateur
   (sinon une mise à jour pourrait pré-cacher d'anciens fichiers). */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(REQUIRED_URLS.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(OPTIONAL_URLS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

/* Activation : suppression des anciens caches de L'EXPERT uniquement (y compris ceux de l'ancienne version multi-fichiers). */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(APP_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Requêtes GET de même origine : cache d'abord (versionné), réseau en secours. Aucun serveur distant requis. */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(handle(request, url));
});

async function handle(request, url) {
  if (request.mode === 'navigate') {
    const m = /\/([a-z-]+)\.html$/.exec(url.pathname);
    if (m && LEGACY_PAGES.includes(m[1])) return Response.redirect(new URL('./#/' + m[1], self.registration.scope).href, 302);
  }
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  }
}
