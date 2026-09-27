import type { Frame, GuideOutput } from '../../core/geometry'
import type { ParamValues } from '../../core/params'
import type { Template } from '../../core/registry'
import { applyOrientation, generationFrame, type Orientation } from '../../core/transform'

/** 產生某版型在指定畫布、參數與方向下的最終圖元（畫布座標）。 */
export function computeComposition(
  template: Template,
  canvas: Frame,
  params: ParamValues,
  orientation: Orientation,
): GuideOutput {
  const gen = generationFrame(canvas, orientation)
  return applyOrientation(template.generate(gen, { ...template.defaults, ...params }), gen, orientation)
}
