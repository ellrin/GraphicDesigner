<script lang="ts">
  // 新專案的畫布尺寸：只編輯草稿，按「建立」時才套用。
  import { CANVAS_MAX, CANVAS_PRESETS, type CanvasSpec } from '../core/canvas'

  let { spec = $bindable() }: { spec: CanvasSpec } = $props()

  const groups = [...new Set(CANVAS_PRESETS.map((p) => p.group))]
  const MAX = CANVAS_MAX

  function applyPreset(id: string) {
    const p = CANVAS_PRESETS.find((q) => q.id === id)
    spec = p ? { presetId: p.id, w: p.w, h: p.h, unit: p.unit } : { ...spec, presetId: null }
  }

  /**
   * 輸入完成（Enter 或離開欄位）才套用，打字途中的空白、0 或過大的中間值不會影響尺寸。
   * 不合法的數字會還原成目前的尺寸。
   */
  function commit(axis: 'w' | 'h', input: HTMLInputElement) {
    const v = Number(input.value)
    if (input.value.trim() !== '' && Number.isFinite(v) && v >= 1 && v <= MAX && v !== spec[axis]) {
      spec = { ...spec, [axis]: v, presetId: null }
    }
    input.value = String(spec[axis])
  }
</script>

<div class="settings">
  <select value={spec.presetId ?? ''} onchange={(e) => applyPreset(e.currentTarget.value)}>
    {#each groups as g (g)}
      <optgroup label={g}>
        {#each CANVAS_PRESETS.filter((p) => p.group === g) as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </optgroup>
    {/each}
    <option value="">自訂尺寸</option>
  </select>

  <div class="dims">
    <input type="number" min="1" max={MAX} value={spec.w} onchange={(e) => commit('w', e.currentTarget)} aria-label="寬" />
    <span>×</span>
    <input type="number" min="1" max={MAX} value={spec.h} onchange={(e) => commit('h', e.currentTarget)} aria-label="高" />
    <select value={spec.unit} onchange={(e) => (spec = { ...spec, unit: e.currentTarget.value as CanvasSpec['unit'], presetId: null })} aria-label="單位">
      <option value="mm">mm</option>
      <option value="px">px</option>
    </select>
    <button onclick={() => (spec = { ...spec, w: spec.h, h: spec.w })} title="直橫切換">⇄</button>
  </div>
</div>

<style>
  .settings {
    display: grid;
    gap: 8px;
  }
  .dims {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) 62px auto;
    align-items: center;
    gap: 6px;
  }
  .dims input {
    min-width: 0;
  }
</style>
