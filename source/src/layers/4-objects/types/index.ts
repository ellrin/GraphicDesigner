// 物件種類註冊表。每種物件是一個資料夾：
//
//   types/<id>/shape.ts     以 Konva 畫出物件（座標原點在物件中心）
//   types/<id>/params.json  種類專屬的參數（邊數、圓角…），面板自動生成
//   types/<id>/meta.json    名稱、分類、預設尺寸與顏色
//
// 新增資料夾即自動出現在「新增物件」清單中。

import type Konva from 'konva'
import { defaultsOf, type ParamSchema, type ParamValues } from '../../../core/params'

export interface ShapeContext {
  /** 物件框的寬高（畫布座標）；圖形畫在 (-w/2, -h/2) 到 (w/2, h/2) 之間 */
  w: number
  h: number
  props: ParamValues
  fill: string
  stroke: string
  /** 框線粗細（畫布座標） */
  strokeWidth: number
  /** 畫布高度，文字字級換算用 */
  canvasH: number
  /** 圖片物件：已載入的圖片 */
  image?: HTMLImageElement
  /** 目前配色（沒有選用配色時為空陣列） */
  palette: string[]
}

export type ShapeBuilder = (ctx: ShapeContext) => Konva.Shape[]

export interface ObjectTypeMeta {
  name: string
  /** panel：範本產生的色塊，不列在「新增物件」中 */
  category: 'shape' | 'text' | 'image' | 'decor' | 'panel'
  order?: number
  /** 預設尺寸，單位是「畫布短邊」 */
  size: [number, number]
  fill?: string
  stroke?: string
  strokeWidth?: number
  /** 縮放時預設維持長寬比 */
  keepRatio?: boolean
}

export interface ObjectType {
  id: string
  meta: ObjectTypeMeta
  params: ParamSchema
  defaults: ParamValues
  build: ShapeBuilder
}

const folderOf = (path: string) => path.split('/').at(-2)!
const byId = <T>(g: Record<string, T>) => new Map(Object.entries(g).map(([p, v]) => [folderOf(p), v]))

const shapes = byId(import.meta.glob<{ default: ShapeBuilder }>('./*/shape.ts', { eager: true }))
const params = byId(import.meta.glob<ParamSchema>('./*/params.json', { eager: true, import: 'default' }))
const metas = byId(import.meta.glob<ObjectTypeMeta>('./*/meta.json', { eager: true, import: 'default' }))

export const objectTypes: ObjectType[] = [...shapes]
  .filter(([id]) => metas.has(id))
  .map(([id, mod]) => {
    const schema = params.get(id) ?? {}
    return { id, meta: metas.get(id)!, params: schema, defaults: defaultsOf(schema), build: mod.default }
  })
  .sort((a, b) => (a.meta.order ?? 999) - (b.meta.order ?? 999))

export const objectTypeOf = (id: string) => objectTypes.find((t) => t.id === id)
