// 存檔（下載 .json）、讀檔、瀏覽器自動暫存。

import { applyProposal, fileBase, flow, isContent, startFromRecipe, newProject, project, replaceProject, ui, uid, unlockSteps, type ProjectData } from './store.svelte'
import { proposeLayouts } from './autolayout'
import { projectLayoutInput } from './layoutInput'
import type { CanvasSpec } from './canvas'
import type { Recipe } from './recipes'
import { resetHistory } from './history.svelte'
import { exportAssets, importAssets } from './assets'
import { deleteProject as removeStored, newProjectId, projects, readProject, setCurrent, setThumb, writeProject } from './projects.svelte'

const APP = 'GraphicDesigner'
const VERSION = 1
/** 舊版的單一自動暫存（第一次載入時轉成「我的專案」中的一個專案） */
const LEGACY_AUTOSAVE_KEY = 'graphic-designer:autosave'

interface SaveFile {
  app: typeof APP
  version: number
  savedAt: string
  flow: { current: number; reached: number }
  project: ProjectData
  /** 專案用到的圖片（data URL）。只有下載的存檔會包含；自動暫存的圖片另存在 IndexedDB。 */
  assets?: Record<string, string>
}

/** 專案中引用到的所有圖片 id（物件與背景）。 */
function referencedAssets(p: ProjectData): Set<string> {
  const ids = new Set<string>()
  if (p.background.assetId) ids.add(p.background.assetId)
  for (const o of p.objects.items) if (typeof o.props.assetId === 'string') ids.add(o.props.assetId)
  return ids
}

function toFile(withAssets: boolean): SaveFile {
  const snapshot = $state.snapshot(project) as ProjectData
  return {
    app: APP,
    version: VERSION,
    savedAt: new Date().toISOString(),
    flow: { current: flow.current, reached: flow.reached },
    project: snapshot,
    ...(withAssets ? { assets: exportAssets(referencedAssets(snapshot)) } : {}),
  }
}

function load(file: SaveFile) {
  importAssets(file.assets)
  replaceProject(file.project)
  flow.reached = Math.max(0, file.flow?.reached ?? 0)
  flow.current = Math.min(Math.max(0, file.flow?.current ?? 0), flow.reached)
  unlockSteps()
  resetHistory()
}

function parse(text: string): SaveFile {
  const data = JSON.parse(text)
  if (data?.app !== APP || !data.project) throw new Error('這不是 GraphicDesigner 的專案檔')
  if (data.version > VERSION) throw new Error('這個專案檔來自較新的版本，請更新程式')
  return data
}

export function downloadProject() {
  const blob = new Blob([JSON.stringify(toFile(true))], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${fileBase()}.gdesign.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** 開啟專案檔：成為「我的專案」中的新專案（不覆蓋目前的作品） */
export async function openProjectFile(file: File) {
  const data = parse(await file.text())
  saveNow()
  setCurrent(newProjectId())
  load(data)
  saveNow()
}

// ── 我的專案 ─────────────────────────────────────────────

let thumbRenderer: (() => string | undefined) | null = null
let thumbTimer: ReturnType<typeof setTimeout> | undefined

/** 由畫布登錄：產生專案縮圖用 */
export function setThumbnailRenderer(fn: () => string | undefined) {
  thumbRenderer = fn
}

/** 立即把目前的專案存到「我的專案」（還沒有編號時建立一個） */
export function saveNow() {
  // 沒有開啟中的專案（清單是空的）：不存，避免自動生出空白專案
  if (!projects.current) return
  const c = project.canvas
  writeProject(projects.current!, toFile(false), { name: project.name, w: c.w, h: c.h, unit: c.unit })
  scheduleThumb()
}

function scheduleThumb() {
  clearTimeout(thumbTimer)
  thumbTimer = setTimeout(() => {
    const id = projects.current
    try {
      const url = thumbRenderer?.()
      if (id && url) setThumb(id, url)
    } catch {
      // 縮圖失敗不影響存檔
    }
  }, 1200)
}

/** 切換到「我的專案」中的另一個專案（先存好目前的） */
export function openStoredProject(id: string): boolean {
  if (id === projects.current) return true
  const data = readProject<SaveFile>(id)
  if (!data) return false
  saveNow()
  setCurrent(id)
  load(data)
  return true
}

/** 讀出某個專案的內容（沿用時使用） */
export function storedProjectData(id: string): ProjectData | null {
  if (id === projects.current) return $state.snapshot(project) as ProjectData
  return readProject<SaveFile>(id)?.project ?? null
}

/** 刪除專案；刪的是目前的專案時，切換到清單中的下一個（沒有就開一個空白專案） */
export function removeProject(id: string) {
  removeStored(id)
  if (id !== projects.current) return
  const next = projects.list[0]
  const data = next ? readProject<SaveFile>(next.id) : null
  if (next && data) {
    setCurrent(next.id)
    load(data)
  } else {
    setCurrent(null)
    replaceProject(newProject())
    flow.current = flow.reached = 0
    resetHistory()
  }
}

/** 專案檔操作的結果訊息（顯示在右側「專案檔」區） */
export const projectMessage = $state({ kind: 'ok' as 'ok' | 'error', text: '' })

/** 開啟專案檔並顯示結果（專案視窗或拖放到頁面任何地方都用這個）；成功時回傳 true */
export async function openProjectWithMessage(file: File): Promise<boolean> {
  try {
    await openProjectFile(file)
    Object.assign(projectMessage, { kind: 'ok', text: `已開啟「${file.name}」` })
    return true
  } catch (err) {
    Object.assign(projectMessage, { kind: 'error', text: err instanceof Error ? err.message : '無法開啟檔案' })
    return false
  }
}

/** 沿用：從某個專案帶過來的東西（系列作品換尺寸時使用） */
export interface CarryOptions {
  source: ProjectData
  /** 配色與背景色 */
  palette: boolean
  logo: boolean
  /** 要帶過來的文字（物件 uid） */
  texts: string[]
}

export interface CreateOptions {
  name?: string
  carry?: CarryOptions
}

/** 建立新專案：加到「我的專案」（目前的作品先存好）；可選擇從版型範例開始、沿用其他專案的內容 */
export function createProject(canvas: CanvasSpec, recipe: Recipe | null, opts: CreateOptions = {}) {
  saveNow()
  setCurrent(newProjectId())
  replaceProject(newProject())
  project.canvas = { ...canvas }
  project.name = opts.name ?? ''
  flow.current = flow.reached = 0
  Object.assign(ui, { selectedComposition: null, selectedGuide: null, selectedBlock: null, selectedObjects: [] })
  if (recipe) startFromRecipe(recipe)
  if (opts.carry) carryOver(opts.carry)
  resetHistory()
  saveNow()
}

/** 把其他專案的配色、Logo 與選定的文字搬到新畫布，並依新尺寸自動排版 */
function carryOver({ source: prev, palette, logo, texts }: CarryOptions) {
  if (palette) {
    project.palette = prev.palette
    project.background.color = prev.background.color
  }
  const c = project.canvas
  const k = Math.min(c.w, c.h) / Math.min(prev.canvas.w, prev.canvas.h)
  const wanted = prev.objects.items.filter((o) => isContent(o) && (o.type === 'image' ? logo : texts.includes(o.uid)))
  for (const o of wanted) {
    const copy = structuredClone(o)
    copy.uid = uid()
    delete copy.props.autoRect
    if (copy.props.contentText !== undefined) {
      copy.props.text = copy.props.contentText
      delete copy.props.contentText
    }
    // 依短邊等比例換算大小，先放在中央，稍後自動排版
    copy.w = Math.min(1, (o.w * prev.canvas.w * k) / c.w)
    copy.h = Math.min(1, (o.h * prev.canvas.h * k) / c.h)
    copy.x = 0.5 - copy.w / 2
    copy.y = 0.5 - copy.h / 2
    project.objects.items.push(copy)
  }
  const proposals = proposeLayouts(projectLayoutInput())
  if (proposals.length) applyProposal(proposals[0])
  unlockSteps()
}

/** 重設：清除目前專案的所有內容並回到第一步（畫布尺寸與名稱保留） */
export function resetProject() {
  const { canvas, name } = project
  replaceProject(newProject())
  project.canvas = { ...canvas }
  project.name = name
  flow.current = flow.reached = 0
  Object.assign(ui, { selectedComposition: null, selectedGuide: null, selectedBlock: null, selectedObjects: [] })
  resetHistory()
  saveNow()
}

/** 「我的專案」裡是否已經有專案（沒有 = 第一次使用） */
export function hasAutosave() {
  return projects.list.length > 0
}

/** 讀回目前的專案（舊版暫存會先轉成「我的專案」），並開始在每次變動後自動儲存。 */
export function initAutosave(): () => void {
  try {
    const legacy = localStorage.getItem(LEGACY_AUTOSAVE_KEY)
    if (legacy && !projects.list.length) {
      const data = parse(legacy)
      const id = newProjectId()
      const c = data.project.canvas
      writeProject(id, data, { name: data.project.name ?? '', w: c.w, h: c.h, unit: c.unit })
      setCurrent(id)
    }
    if (legacy) localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
  } catch {
    // 舊暫存損毀：略過
  }
  try {
    const id = projects.current && readProject(projects.current) ? projects.current : projects.list[0]?.id
    const data = id ? readProject<SaveFile>(id) : null
    if (id && data) {
      setCurrent(id)
      load(data)
    }
  } catch {
    // 專案損毀或無法存取時，直接以空白專案開始
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let first = true
  return $effect.root(() => {
    $effect(() => {
      JSON.stringify(project)
      void flow.current
      void flow.reached
      // 剛載入時不存（避免第一次打開就多出一個空白專案）
      if (first) {
        first = false
        return
      }
      clearTimeout(timer)
      timer = setTimeout(saveNow, 500)
    })
  })
}
