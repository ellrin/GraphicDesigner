// 超參數定義。每個版型的 params.json 就是一個 ParamSchema，
// 參數面板會依據它自動產生 UI，新增參數不需要寫任何介面程式。

export interface PointValue {
  x: number
  y: number
}

export type ParamSpec =
  | { type: 'number'; label: string; min: number; max: number; step?: number; default: number }
  | { type: 'int'; label: string; min: number; max: number; default: number }
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'select'; label: string; options: { value: string; label: string }[]; default: string }
  /**
   * 位置參數（相對畫框 0–1）。會在畫布上顯示可拖曳的控制點，
   * 並吸附到構圖錨點。min/max 可超出 0–1，例如畫面外的消失點。
   */
  | { type: 'point'; label: string; default: PointValue; min?: number; max?: number }

export type ParamValue = number | boolean | string | PointValue
export type ParamValues = Record<string, ParamValue>

export function defaultsOf(schema: ParamSchema): ParamValues {
  const out: ParamValues = {}
  for (const [key, spec] of Object.entries(schema)) {
    out[key] = typeof spec.default === 'object' ? { ...spec.default } : spec.default
  }
  return out
}

export type ParamSchema = Record<string, ParamSpec>
