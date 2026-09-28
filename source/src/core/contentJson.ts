// 文字內容的 JSON 檔：可以先在其他地方準備好文字，一次匯入（key 用英文）。
//
// {
//   "name": "專案名稱（選填）",
//   "content": [
//     { "type": "logo", "src": "data:image/png;base64,…（選填，沒有時略過）" },
//     { "type": "title", "text": "標題" },
//     { "type": "subtitle", "text": "子標題" },
//     { "type": "body", "text": "內文，可用 \n 分段" },
//     { "type": "list", "items": ["條列一", "條列二"] },
//     { "type": "price", "items": [{ "name": "品名", "price": "120", "note": "說明（選填）" }] },
//     { "type": "highlight", "text": "醒目訊息" }
//   ]
// }

import { dataUrlToAsset } from './assets'
import { addContent, addLogo, project } from './store.svelte'

type Entry =
  | { type: 'logo'; src?: string }
  | { type: 'title' | 'subtitle' | 'body' | 'highlight'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'price'; items: { name: string; price?: string | number; note?: string }[] }

export interface ContentFile {
  name?: string
  content: Entry[]
}

export const SAMPLE_CONTENT: ContentFile = {
  name: '山嵐咖啡-菜單',
  content: [
    { type: 'logo', src: '' },
    { type: 'title', text: 'MENU 菜單' },
    { type: 'subtitle', text: '咖啡 Coffee' },
    {
      type: 'price',
      items: [
        { name: '美式咖啡', price: '90' },
        { name: '拿鐵', price: '120', note: '可選熱・冰' },
        { name: '手沖單品', price: '180', note: '每日更換豆單' },
      ],
    },
    { type: 'subtitle', text: '甜點 Dessert' },
    { type: 'price', items: [{ name: '巴斯克乳酪蛋糕', price: '150' }, { name: '司康', price: '80' }] },
    { type: 'list', items: ['每日限量', '可外帶'] },
    { type: 'body', text: '以上價格皆含稅。\n低消一杯飲品。' },
    { type: 'highlight', text: '開幕優惠 9 折' },
  ],
}

export function downloadSample() {
  const blob = new Blob([JSON.stringify(SAMPLE_CONTENT, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'content-sample.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** 價目的一項轉成文字：「品名 價格」，說明放在下一行的括號中 */
const priceLines = (items: { name: string; price?: string | number; note?: string }[]) =>
  items.flatMap((it) => [`${it.name}${it.price !== undefined && it.price !== '' ? ` ${it.price}` : ''}`, ...(it.note ? [`（${it.note}）`] : [])]).join('\n')

/** 匯入文字內容 JSON：加到目前的內容清單後面；回傳加入的項目數 */
export async function importContentJson(text: string): Promise<number> {
  let data: ContentFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('檔案不是正確的 JSON 格式')
  }
  if (!data || !Array.isArray(data.content)) throw new Error('找不到 content 清單（請參考範例檔）')
  if (data.name && !project.name) project.name = String(data.name)
  let n = 0
  for (const e of data.content) {
    if (!e || typeof e !== 'object') continue
    if (e.type === 'logo') {
      if (e.src && e.src.startsWith('data:image/')) {
        const { id, width, height } = await dataUrlToAsset(e.src)
        addLogo(id, width, height)
        n++
      }
    } else if (e.type === 'list' && Array.isArray(e.items)) {
      addContent('list', e.items.map((x) => `・${String(x).replace(/^[・•\-]\s*/, '')}`).join('\n'))
      n++
    } else if (e.type === 'price' && Array.isArray(e.items)) {
      addContent('price', priceLines(e.items.filter((x) => x && x.name)))
      n++
    } else if (['title', 'subtitle', 'body', 'highlight'].includes(e.type) && 'text' in e && e.text) {
      addContent(e.type as 'title', String(e.text))
      n++
    }
  }
  return n
}
