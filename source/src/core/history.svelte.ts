// 復原／重做：專案每次變動（停止操作 300ms 後）存一份快照。
// 拖曳滑桿或控制點時的連續變動會合併成一步。

import { historyHooks, project, replaceProject, type ProjectData } from './store.svelte'

const LIMIT = 100
const DEBOUNCE = 300

const past: string[] = []
const future: string[] = []
let current = ''
let timer: ReturnType<typeof setTimeout> | undefined

export const history = $state({ canUndo: false, canRedo: false })

const refresh = () => {
  history.canUndo = past.length > 0
  history.canRedo = future.length > 0
}

function commit(snapshot: string) {
  clearTimeout(timer)
  timer = undefined
  if (snapshot === current) return
  past.push(current)
  if (past.length > LIMIT) past.shift()
  current = snapshot
  future.length = 0
  refresh()
}

function restore(snapshot: string) {
  clearTimeout(timer)
  timer = undefined
  replaceProject(JSON.parse(snapshot) as ProjectData)
  current = JSON.stringify(project)
  refresh()
}

/** 開始追蹤專案變動。回傳停止追蹤的函式。 */
export function initHistory(): () => void {
  current = JSON.stringify(project)
  historyHooks.checkpoint = () => commit(JSON.stringify(project))
  return $effect.root(() => {
    $effect(() => {
      const snapshot = JSON.stringify(project)
      if (snapshot === current) return
      clearTimeout(timer)
      timer = setTimeout(() => commit(snapshot), DEBOUNCE)
    })
  })
}

/** 讀檔或新專案時呼叫：清空紀錄，以目前狀態為起點。 */
export function resetHistory() {
  clearTimeout(timer)
  timer = undefined
  past.length = 0
  future.length = 0
  current = JSON.stringify(project)
  refresh()
}

export function undo() {
  if (timer) commit(JSON.stringify(project))
  const prev = past.pop()
  if (prev === undefined) return
  future.push(current)
  restore(prev)
}

export function redo() {
  const next = future.pop()
  if (next === undefined) return
  past.push(current)
  restore(next)
}
