// 手風琴式收合：同一組（左側某一步、右側）的區塊一次只展開一個。
// 各組展開的是哪一個記在瀏覽器中（介面偏好，不寫進專案檔）。

import { getContext, setContext, untrack } from 'svelte'

const KEY = 'graphic-designer:accordion'

function read(): Record<string, string | null> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** 各組使用者選擇展開的區塊；沒有紀錄或 null = 全部收合 */
const chosen = $state<Record<string, string | null>>(read())
/** 各組目前畫面上有哪些區塊（依出現順序） */
const mounted = $state<Record<string, string[]>>({})

export function setOpen(group: string, id: string | null) {
  // 在 $effect 裡呼叫時不要把 chosen 當成相依（否則收合後又會被重新展開）
  untrack(() => {
    chosen[group] = id
    try {
      localStorage.setItem(KEY, JSON.stringify(chosen))
    } catch {
      // 略過
    }
  })
}

/** 這一組目前展開的區塊（預設全部收合） */
export function openIn(group: string): string | null {
  const c = chosen[group]
  return c && (mounted[group] ?? []).includes(c) ? c : null
}

/** 所有組回到全部收合 */
export function resetAccordion() {
  for (const k of Object.keys(chosen)) delete chosen[k]
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 略過
  }
}

export function register(group: string, id: string) {
  const ids = mounted[group] ?? []
  if (!ids.includes(id)) mounted[group] = [...ids, id]
  return () => {
    mounted[group] = (mounted[group] ?? []).filter((x) => x !== id)
  }
}

const CTX = Symbol('accordion')

export function provideAccordion(name: () => string) {
  setContext(CTX, name)
}

export function accordionGroup(): (() => string) | undefined {
  return getContext(CTX)
}
