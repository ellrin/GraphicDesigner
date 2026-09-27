# GraphicDesigner

以「構圖」為起點、分層線性進行的瀏覽器 2D 平面設計工具。

```
① 空間構圖 → ② 視覺引導 → ③ 區塊分佈 → ④ 插入物件 → ⑤ 微調與匯出
```

## 使用方式（不需要安裝任何東西）

- **線上版**：開啟 GitHub Pages 網址（部署後在 repo 的 About 欄位）
- **離線版**：下載或 clone 這個 repo，雙擊 `dist/index.html`

## 開發

需要 [Node.js](https://nodejs.org/)。

```bash
npm install
npm run dev      # 開發伺服器（即時更新）
npm run check    # 型別檢查
npm run build    # 輸出單一檔案 dist/index.html
```

`dist/` 有納入版控，修改後記得 `npm run build` 再 commit，離線版才會更新。

## 專案結構

```
src/
├─ core/                     與圖層無關的核心
│  ├─ geometry.ts            圖元型別（線、折線、圓）與幾何工具
│  ├─ transform.ts           旋轉 / 翻轉（所有版型共用）
│  ├─ params.ts              超參數定義格式
│  ├─ registry.ts            版型自動註冊
│  ├─ canvas.ts              畫布尺寸與匯出換算
│  └─ store.svelte.ts        專案狀態與線性流程
├─ config/                   可調設定（不需改程式）
│  ├─ canvas-presets.json    預設畫布尺寸
│  ├─ theme.json             引導線顏色、線寬、虛線、匯出 DPI
│  └─ steps.ts               流程步驟
├─ layers/
│  └─ 1-composition/
│     ├─ templates/<id>/     每個構圖一個資料夾
│     ├─ Panel.svelte        本層的側欄介面
│     └─ compute.ts
├─ renderer/                 Konva 繪製與匯出
└─ ui/                       共用介面元件（參數面板自動生成等）
```

## 新增一個構圖版型

在 `src/layers/1-composition/templates/` 新增一個資料夾，放三個檔案，**不需要修改其他任何檔案**：

**`meta.json`**：名稱與說明

```json
{ "name": "十字構圖", "description": "…", "order": 110 }
```

**`params.json`**：超參數（介面會自動產生對應的滑桿、選單、勾選框）

```json
{
  "thickness": { "type": "number", "label": "寬度", "min": 0, "max": 1, "step": 0.01, "default": 0.2 },
  "count":     { "type": "int",    "label": "數量", "min": 1, "max": 5, "default": 2 },
  "showX":     { "type": "boolean","label": "顯示 X", "default": true },
  "mode":      { "type": "select", "label": "樣式", "options": [{ "value": "a", "label": "A" }], "default": "a" }
}
```

**`generate.ts`**：純函式，輸入畫框大小與參數，輸出圖元與錨點

```ts
import { line, pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

export default defineGenerator<{ thickness: number }>(({ w, h }, p) => ({
  primitives: [line(pt(w / 2, 0), pt(w / 2, h)), line(pt(0, h / 2), pt(w, h / 2))],
  anchors: [{ x: w / 2, y: h / 2, label: '中心' }],
}))
```

規則：

- 座標原點在左上，單位與畫布相同。
- **不用處理旋轉與翻轉**，核心會自動處理（旋轉 90° 時會用長寬對調的畫框呼叫你的函式）。
- `weight: 'sub'` 表示輔助線（較細、另一個顏色），`dashed: true` 表示細虛線。
- 錨點是後續圖層（區塊、物件）吸附的位置。
