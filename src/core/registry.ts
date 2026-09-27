// 版型註冊表。每個版型是一個資料夾：
//
//   templates/<id>/generate.ts   純函式：(畫框, 參數) → 圖元 + 錨點
//   templates/<id>/params.json   超參數定義（見 params.ts）
//   templates/<id>/meta.json     名稱、說明、排序
//
// 新增資料夾即自動出現在介面中，不需要修改其他檔案。

import type { Frame, GuideOutput } from './geometry'
import { defaultsOf, type ParamSchema, type ParamValues } from './params'

export type Generator<P = any> = (frame: Frame, params: P) => GuideOutput

/** 讓 generate.ts 取得參數型別提示用。 */
export const defineGenerator = <P>(fn: Generator<P>): Generator<P> => fn

export interface TemplateMeta {
  name: string
  description?: string
  order?: number
}

export interface Template {
  id: string
  meta: TemplateMeta
  params: ParamSchema
  defaults: ParamValues
  generate: Generator<ParamValues>
}

type Glob<T> = Record<string, T>

const folderOf = (path: string) => path.split('/').at(-2)!

/** 將三組 import.meta.glob 的結果組成註冊表（glob 必須在各圖層內以字面字串呼叫）。 */
export function buildRegistry(
  generators: Glob<{ default: Generator }>,
  params: Glob<ParamSchema>,
  metas: Glob<TemplateMeta>,
): Template[] {
  const byId = <T>(g: Glob<T>) => new Map(Object.entries(g).map(([path, v]) => [folderOf(path), v]))
  const paramMap = byId(params)
  const metaMap = byId(metas)

  const templates: Template[] = []
  for (const [id, mod] of byId(generators)) {
    const schema = paramMap.get(id) ?? {}
    const meta = metaMap.get(id)
    if (!meta) {
      console.warn(`[registry] 版型 "${id}" 缺少 meta.json，已略過`)
      continue
    }
    templates.push({ id, meta, params: schema, defaults: defaultsOf(schema), generate: mod.default })
  }
  return templates.sort((a, b) => (a.meta.order ?? 999) - (b.meta.order ?? 999))
}
