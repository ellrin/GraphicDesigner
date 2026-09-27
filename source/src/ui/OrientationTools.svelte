<script lang="ts">
  import { IDENTITY, rotateClockwise, type Orientation } from '../core/transform'

  let { orientation = $bindable() }: { orientation: Orientation } = $props()
</script>

<div class="tools">
  <button class:on={orientation.flipH} onclick={() => (orientation.flipH = !orientation.flipH)}>⇋ 水平翻轉</button>
  <button class:on={orientation.flipV} onclick={() => (orientation.flipV = !orientation.flipV)}>⇵ 垂直翻轉</button>
  <button onclick={() => (orientation = rotateClockwise(orientation))} title="每次順時針旋轉 90°">↻ 旋轉（目前 {orientation.rotate}°）</button>
  <button onclick={() => (orientation = { ...IDENTITY })}>重設</button>
</div>

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
</style>
