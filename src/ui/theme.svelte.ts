// 介面主題（只影響介面外觀，不影響作品）。選擇記在這台電腦的瀏覽器中，不寫進專案檔。

import themes from '../config/ui-themes.json'

export interface UiTheme {
  id: string
  name: string
  swatches: string[]
}

export const UI_THEMES: UiTheme[] = themes

const KEY = 'graphic-designer:ui-theme'

function initial(): string {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && UI_THEMES.some((t) => t.id === saved)) return saved
  } catch {
    // 無法存取 localStorage：用預設主題
  }
  return UI_THEMES[0].id
}

export const uiTheme = $state({ id: initial() })

export function applyTheme(id: string) {
  uiTheme.id = id
  document.documentElement.dataset.theme = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // 略過
  }
}

/** 目前主題的 CSS 變數值（給 Konva 畫布上的選取框等使用） */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
