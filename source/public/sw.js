// Service worker（只在 GitHub Pages 等網址上啟用，雙擊本機檔案時不會用到）：
// - 程式本體與圖示：先用快取、背景更新，安裝成 App 後可離線開啟
// - Google Fonts：用過的字型會被快取，離線時仍能顯示

const VERSION = 'v1'
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, event.request))
  } else if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(APP_CACHE, event.request))
  }
})
