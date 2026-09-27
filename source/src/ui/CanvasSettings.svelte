<script lang="ts">
  import { CANVAS_MAX, CANVAS_PRESETS } from '../core/canvas'
  import { project, resizeCanvas } from '../core/store.svelte'

  // 尺寸變更一律經過 resizeCanvas，讓已放置的物件等比例跟著調整、不被拉伸
  const canvas = $derived(project.canvas)
  const groups = [...new Set(CANVAS_PRESETS.map((p) => p.group))]

  function applyPreset(id: string) {
    const p = CANVAS_PRESETS.find((q) => q.id === id)
    if (!p) {
      project.canvas.presetId = null
      return
    }
    resizeCanvas(p.w, p.h, { presetId: p.id, unit: p.unit })
  }

  function swap() {
    resizeCanvas(canvas.h, canvas.w)
  }

  function manual() {
    project.canvas.presetId = null
  }

  const MAX = CANVAS_MAX

  /**
   * 輸入完成（Enter 或離開欄位）才套用，打字途中的空白、0 或過大的中間值不會影響畫布。
   * 不合法的數字會還原成目前的尺寸。
   */
  function commit(axis: 'w' | 'h', input: HTMLInputElement) {
    const v = Number(input.value)
    if (input.value.trim() !== '' && Number.isFinite(v) && v >= 1 && v <= MAX && v !== canvas[axis]) {
      resizeCanvas(axis === 'w' ? v : canvas.w, axis === 'h' ? v : canvas.h, { presetId: null })
    }
    input.value = String(canvas[axis])
  }
</script>

<div class="settings">
  <select value={canvas.presetId ?? ''} onchange={(e) => applyPreset(e.currentTarget.value)}>
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
    <input type="number" min="1" max={MAX} value={canvas.w} onchange={(e) => commit('w', e.currentTarget)} aria-label="寬" />
    <span>×</span>
    <input type="number" min="1" max={MAX} value={canvas.h} onchange={(e) => commit('h', e.currentTarget)} aria-label="高" />
    <select bind:value={project.canvas.unit} onchange={manual} aria-label="單位">
      <option value="mm">mm</option>
      <option value="px">px</option>
    </select>
    <button onclick={swap} title="直橫切換">⇄</button>
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
