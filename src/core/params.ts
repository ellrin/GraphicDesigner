// 超參數定義。每個版型的 params.json 就是一個 ParamSchema，
// 參數面板會依據它自動產生 UI，新增參數不需要寫任何介面程式。

export type ParamSpec =
  | { type: 'number'; label: string; min: number; max: number; step?: number; default: number }
  | { type: 'int'; label: string; min: number; max: number; default: number }
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'select'; label: string; options: { value: string; label: string }[]; default: string }

export type ParamSchema = Record<string, ParamSpec>

export type ParamValue = number | boolean | string
export type ParamValues = Record<string, ParamValue>

export function defaultsOf(schema: ParamSchema): ParamValues {
  const out: ParamValues = {}
  for (const [key, spec] of Object.entries(schema)) out[key] = spec.default
  return out
}
