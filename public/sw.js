const CACHE_NAME = 'touchline-shell-v1'
const APP_ROOT = new URL('./', self.location.href).toString()
const INDEX_URL = new URL('index.html', APP_ROOT).toString()

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll([APP_ROOT, INDEX_URL])
        const index = await cache.match(INDEX_URL)
        if (!index) throw new Error('Touchline app shell could not be cached.')
        const html = await index.text()
        const assets = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)]
          .map((match) => new URL(match[1], APP_ROOT))
          .filter((url) => url.origin === self.location.origin)
          .map((url) => url.toString())
        await cache.addAll(assets)
      })
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('touchline-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(INDEX_URL)) || Response.error()),
    )
    return
  }

  if (!['script', 'style', 'image', 'font'].includes(request.destination)) return

  event.respondWith((async () => {
    try {
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    } catch {
      return (await caches.match(request)) || Response.error()
    }
  })())
})