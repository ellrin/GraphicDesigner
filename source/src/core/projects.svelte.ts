// 我的專案：瀏覽器中保存多個專案，可以隨時切換。
// 每個專案的內容分開存放；清單只記名稱、尺寸、時間與縮圖（圖片另存在 IndexedDB，各專案共用）。

const INDEX_KEY = 'graphic-designer:projects'
const CURRENT_KEY = 'graphic-designer:current'
const dataKey = (id: string) => `graphic-designer:project:${id}`

export interface ProjectMeta {
  id: string
  name: string
  w: number
  h: number
  unit: string
  updatedAt: number
  /** 縮圖（小張 JPEG data URL） */
  thumb?: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const projects = $state<{ list: ProjectMeta[]; current: string | null }>({
  list: read<ProjectMeta[]>(INDEX_KEY, []),
  current: read<string | null>(CURRENT_KEY, null),
})

const persistIndex = () => write(INDEX_KEY, $state.snapshot(projects.list))

export function newProjectId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function setCurrent(id: string | null) {
  projects.current = id
  write(CURRENT_KEY, id)
}

/** 讀出某個專案的存檔內容（格式與專案檔相同） */
export function readProject<T>(id: string): T | null {
  return read<T | null>(dataKey(id), null)
}

/** 寫入專案內容並更新清單上的資訊；新專案會加到清單最前面 */
export function writeProject(id: string, data: unknown, meta: Omit<ProjectMeta, 'id' | 'updatedAt' | 'thumb'>): boolean {
  if (!write(dataKey(id), data)) return false
  const i = projects.list.findIndex((p) => p.id === id)
  const next = { ...(i >= 0 ? projects.list[i] : {}), ...meta, id, updatedAt: Date.now() }
  if (i >= 0) projects.list[i] = next
  else projects.list.unshift(next)
  persistIndex()
  return true
}

export function setThumb(id: string, thumb: string) {
  const p = projects.list.find((x) => x.id === id)
  if (!p) return
  p.thumb = thumb
  if (!persistIndex()) {
    // 空間不足時放棄縮圖（專案內容比縮圖重要）
    delete p.thumb
    persistIndex()
  }
}

export function deleteProject(id: string) {
  projects.list = projects.list.filter((p) => p.id !== id)
  try {
    localStorage.removeItem(dataKey(id))
  } catch {
    // 略過
  }
  persistIndex()
}
