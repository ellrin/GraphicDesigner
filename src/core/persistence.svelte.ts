// 存檔（下載 .json）、讀檔、瀏覽器自動暫存。

import { flow, newProject, project, replaceProject, type ProjectData } from './store.svelte'
import { resetHistory } from './history.svelte'

const APP = 'GraphicDesigner'
const VERSION = 1
const AUTOSAVE_KEY = 'graphic-designer:autosave'

interface SaveFile {
  app: typeof APP
  version: number
  savedAt: string
  flow: { current: number; reached: number }
  project: ProjectData
}

function toFile(): SaveFile {
  return {
    app: APP,
    version: VERSION,
    savedAt: new Date().toISOString(),
    flow: { current: flow.current, reached: flow.reached },
    project: $state.snapshot(project) as ProjectData,
  }
}

function load(file: SaveFile) {
  replaceProject(file.project)
  flow.reached = Math.max(0, file.flow?.reached ?? 0)
  flow.current = Math.min(Math.max(0, file.flow?.current ?? 0), flow.reached)
  resetHistory()
}

function parse(text: string): SaveFile {
  const data = JSON.parse(text)
  if (data?.app !== APP || !data.project) throw new Error('這不是 GraphicDesigner 的專案檔')
  if (data.version > VERSION) throw new Error('這個專案檔來自較新的版本，請更新程式')
  return data
}

export function downloadProject() {
  const blob = new Blob([JSON.stringify(toFile(), null, 2)], { type: 'application/json' })
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

export function startNewProject() {
  replaceProject(newProject())
  flow.current = flow.reached = 0
  resetHistory()
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
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toFile()))
        } catch {
          // 無痕模式或空間不足：略過
        }
      }, 500)
    })
  })
}
