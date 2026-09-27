// 存檔（下載 .json）、讀檔、瀏覽器自動暫存。

import { applyRecipe, flow, newProject, project, replaceProject, ui, unlockSteps, type ProjectData } from './store.svelte'
import type { CanvasSpec } from './canvas'
import type { Recipe } from './recipes'
import { resetHistory } from './history.svelte'
import { exportAssets, importAssets } from './assets'

const APP = 'GraphicDesigner'
const VERSION = 1
const AUTOSAVE_KEY = 'graphic-designer:autosave'

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
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  a.download = `design-${stamp}.gdesign.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function openProjectFile(file: File) {
  load(parse(await file.text()))
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

/** 建立新專案：指定畫布尺寸，可選擇從版型範例開始（範例包含的步驟會一併解鎖） */
export function createProject(canvas: CanvasSpec, recipe: Recipe | null) {
  replaceProject(newProject())
  project.canvas = { ...canvas }
  flow.current = flow.reached = 0
  Object.assign(ui, { selectedComposition: null, selectedGuide: null, selectedBlock: null, selectedObjects: [] })
  if (recipe) applyRecipe(recipe)
  resetHistory()
}

/** 重設：清除所有內容並回到第一步，畫布尺寸保留 */
export function resetProject() {
  createProject({ ...project.canvas }, null)
}

/** 瀏覽器裡是否有上次的自動暫存（沒有 = 第一次使用） */
export function hasAutosave() {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== null
  } catch {
    return false
  }
}

/** 讀回上次的自動暫存（若有），並開始在每次變動後暫存。 */
export function initAutosave(): () => void {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    if (saved) load(parse(saved))
  } catch {
    // 暫存損毀或無法存取時，直接以新專案開始
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  return $effect.root(() => {
    $effect(() => {
      JSON.stringify(project)
      void flow.current
      void flow.reached
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toFile(false)))
        } catch {
          // 無痕模式或空間不足：略過
        }
      }, 500)
    })
  })
}
