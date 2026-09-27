// 縮放時的尺寸比例吸附：寬、高靠近畫布的 1/3、1/2、0.618… 時自動對齊，並在旁邊顯示比例。

import Konva from 'konva'
import { snapSize } from '../core/snap'
import { selectionColor } from './selection'

const SNAP_PX = 8

interface Ctx {
  scale: number
  canvas: { w: number; h: number }
  paper: Konva.Group
}

export class SizeSnapper {
  private label = new Konva.Text({ fontSize: 11, fontStyle: 'bold', padding: 3, listening: false, visible: false })
  private tag = new Konva.Rect({ listening: false, visible: false, cornerRadius: 2 })

  constructor(
    private tr: Konva.Transformer,
    layerGroup: Konva.Group,
    private ctx: () => Ctx,
  ) {
    layerGroup.add(this.tag, this.label)
    tr.boundBoxFunc((oldBox, newBox) => this.snap(oldBox, newBox))
    tr.on('transformend', () => this.hide())
  }

  private hide() {
    this.label.visible(false)
    this.tag.visible(false)
  }

  /** boundBoxFunc 的座標是螢幕座標；只處理未旋轉的外框 */
  private snap(oldBox: Konva.Box & { rotation: number }, newBox: Konva.Box & { rotation: number }) {
    const { scale, canvas, paper } = this.ctx()
    if (Math.abs(newBox.rotation) > 0.01) return newBox
    const limit = SNAP_PX
    const box = { ...newBox }
    const w = snapSize(box.width / scale, canvas.w, limit / scale)
    const h = snapSize(box.height / scale, canvas.h, limit / scale)
    const leftMoved = Math.abs(newBox.x - oldBox.x) > 0.01
    const topMoved = Math.abs(newBox.y - oldBox.y) > 0.01
    if (w.label && Math.abs(newBox.width - oldBox.width) > 0.01) {
      const nw = w.len * scale
      if (leftMoved) box.x = newBox.x + newBox.width - nw
      box.width = nw
    }
    if (h.label && Math.abs(newBox.height - oldBox.height) > 0.01) {
      const nh = h.len * scale
      if (topMoved) box.y = newBox.y + newBox.height - nh
      box.height = nh
    }
    const parts = [w.label && `寬 ${w.label}`, h.label && `高 ${h.label}`].filter(Boolean)
    if (parts.length) {
      // 標籤放在外框右下角（轉成紙面座標）
      const inv = paper.getAbsoluteTransform().copy().invert()
      const at = inv.point({ x: box.x + box.width, y: box.y + box.height })
      const k = 1 / scale
      this.label.setAttrs({ text: parts.join('・'), x: at.x + 6 * k, y: at.y + 6 * k, scaleX: k, scaleY: k, fill: '#fff', visible: true })
      this.tag.setAttrs({
        x: at.x + 6 * k,
        y: at.y + 6 * k,
        width: this.label.width() * k,
        height: this.label.height() * k,
        fill: selectionColor(),
        visible: true,
      })
      this.tag.moveToTop()
      this.label.moveToTop()
    } else this.hide()
    return box
  }
}
