<script lang="ts">
  import { CANVAS_PRESETS, type CanvasSpec } from '../core/canvas'

  let { canvas = $bindable() }: { canvas: CanvasSpec } = $props()

  const groups = [...new Set(CANVAS_PRESETS.map((p) => p.group))]

  function applyPreset(id: string) {
    const p = CANVAS_PRESETS.find((q) => q.id === id)
    if (!p) {
      canvas.presetId = null
      return
    }
    canvas.presetId = p.id
    canvas.unit = p.unit
    canvas.w = p.w
    canvas.h = p.h
  }

  function swap() {
    ;[canvas.w, canvas.h] = [canvas.h, canvas.w]
  }

  function manual() {
    canvas.presetId = null
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
    <input type="number" min="1" bind:value={canvas.w} oninput={manual} aria-label="寬" />
    <span>×</span>
    <input type="number" min="1" bind:value={canvas.h} oninput={manual} aria-label="高" />
    <select bind:value={canvas.unit} onchange={manual} aria-label="單位">
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
    grid-template-columns: 1fr auto 1fr auto auto;
    align-items: center;
    gap: 6px;
  }
  .dims input {
    min-width: 0;
  }
</style>
