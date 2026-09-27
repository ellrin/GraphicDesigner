// 線性流程的步驟定義。順序即流程順序；ready = false 表示尚未開發。

export interface StepDef {
  id: 'composition' | 'guides' | 'blocks' | 'objects' | 'refine'
  label: string
  ready: boolean
}

export const STEPS: StepDef[] = [
  { id: 'composition', label: '空間構圖', ready: true },
  { id: 'guides', label: '視覺引導', ready: true },
  { id: 'blocks', label: '區塊分佈', ready: true },
  { id: 'objects', label: '插入物件', ready: false },
  { id: 'refine', label: '微調與匯出', ready: false },
]
