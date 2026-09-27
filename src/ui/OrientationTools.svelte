<script lang="ts">
  import { IDENTITY, rotateClockwise, type Orientation } from '../core/transform'

  let { orientation = $bindable() }: { orientation: Orientation } = $props()
</script>

<div class="tools">
  <button class:on={orientation.flipH} onclick={() => (orientation.flipH = !orientation.flipH)}>⇋ 水平翻轉</button>
  <button class:on={orientation.flipV} onclick={() => (orientation.flipV = !orientation.flipV)}>⇵ 垂直翻轉</button>
  <button onclick={() => (orientation = rotateClockwise(orientation))}>↻ 旋轉 90°</button>
  <button onclick={() => (orientation = { ...IDENTITY })}>重設</button>
</div>
<p class="hint">目前旋轉 {orientation.rotate}°</p>

<style>
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .hint {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
