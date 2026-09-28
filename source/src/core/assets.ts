// 圖片資源。圖片很大，所以不放進專案狀態（避免復原紀錄每一步都複製整張圖），
// 只在專案中以 id 引用。瀏覽器端存在 IndexedDB；存檔時才把用到的圖片一起寫進檔案。

const DB = 'graphic-designer'
const STORE = 'assets'
const MAX_EDGE = 4096

const dataUrls = new Map<string, string>()
const images = new Map<string, Promise<HTMLImageElement>>()

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function getAssetUrl(id: string): string | undefined {
  return dataUrls.get(id)
}

export function getImage(id: string): Promise<HTMLImageElement> | undefined {
  const url = dataUrls.get(id)
  if (!url) return undefined
  let p = images.get(id)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('圖片無法載入'))
      img.src = url
    })
    images.set(id, p)
  }
  return p
}

function putAsset(id: string, url: string) {
  dataUrls.set(id, url)
  idb('readwrite', (s) => s.put(url, id)).catch(() => {
    // IndexedDB 無法使用（例如無痕模式）：只保留在記憶體中
  })
}

const newId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** 讀入使用者選的圖片檔；過大的圖片會縮到長邊 4096px。回傳 id 與原始尺寸比例。 */
export async function importImageFile(file: File): Promise<{ id: string; width: number; height: number }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  return dataUrlToAsset(url, file.type)
}

/** 由 data URL 建立圖片（文字內容 JSON 中的 Logo 也用這個） */
export async function dataUrlToAsset(url: string, type = url.slice(5, url.indexOf(';'))): Promise<{ id: string; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('無法讀取這個圖片檔'))
    i.src = url
  })

  let finalUrl = url
  let { naturalWidth: width, naturalHeight: height } = img
  const long = Math.max(width, height)
  if (long > MAX_EDGE) {
    const k = MAX_EDGE / long
    width = Math.round(width * k)
    height = Math.round(height * k)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    finalUrl = type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
  }

  const id = newId()
  putAsset(id, finalUrl)
  return { id, width, height }
}

/** 啟動時從 IndexedDB 讀回所有圖片。 */
export async function loadStoredAssets(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) return resolve()
        dataUrls.set(String(cur.key), cur.value as string)
        cur.continue()
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    // 無法使用 IndexedDB：略過
  }
}

/** 存檔用：取出指定 id 的圖片。 */
export function exportAssets(ids: Iterable<string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of ids) {
    const url = dataUrls.get(id)
    if (url) out[id] = url
  }
  return out
}

/** 讀檔用：把檔案內的圖片放回資源庫。 */
export function importAssets(assets: Record<string, string> | undefined) {
  for (const [id, url] of Object.entries(assets ?? {})) {
    if (typeof url === 'string' && url.startsWith('data:image/')) putAsset(id, url)
  }
}
