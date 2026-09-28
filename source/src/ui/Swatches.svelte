<script lang="ts">
  // 目前配色的色票：點一下套用顏色。沒有選用配色時不顯示。
  import { paletteOf } from '../core/palettes'
  import { project } from '../core/store.svelte'

  let { value = '', onpick }: { value?: string; onpick: (color: string) => void } = $props()
  const colors = $derived(paletteOf(project.palette)?.colors ?? [])
</script>

{#if colors.length}
  <span class="swatches">
    {#each colors as c, i (i)}
      <button class:on={c.toLowerCase() === value.toLowerCase()} style:background={c} title={c} aria-label="套用 {c}" onclick={() => onpick(c)}></button>
    {/each}
  </span>
{/if}

<style>
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  button {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid rgb(128 128 128 / 0.35);
    border-radius: 4px;
  }
  button:hover:not(:disabled) {
    transform: scale(1.15);
  }
  button.on {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
