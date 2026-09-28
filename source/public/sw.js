// Service worker（只在 GitHub Pages 等網址上啟用，雙擊本機檔案時不會用到）：
// - 程式本體：先取網路上的最新版，離線時用快取；圖示等檔案先用快取、背景更新
// - Google Fonts：用過的字型會被快取，離線時仍能顯示

const VERSION = 'v3'
const APP_CACHE = `gd-app-${VERSION}`
const FONT_CACHE = 'gd-fonts'
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gd-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** 先回傳快取，同時在背景向網路更新快取 */
function staleWhileRevalidate(cacheName, request) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(request, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || fresh
    }),
  )
}

/** 先向網路取最新版，離線時才用快取（程式本體用這個，更新後打開就是新版） */
function networkFirst(cacheName, request) {
  return caches.open(cacheName).then((cache) =>
    // 不經過瀏覽器的 HTTP 快取（GitHub Pages 會快取 10 分鐘），確保拿到剛部署的版本
    fetch(request, { cache: 'no-store' })
      .then((res) => {
        if (res.ok) cache.put(request, res.clone())
        return res
      })
      .catch(() => cache.match(request).then((cached) => cached || cache.match('./'))),
  )
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(APP_CACHE, event.request))
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, event.request))
  } else if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(APP_CACHE, event.request))
  }
})
