<script lang="ts">
  // 右側「配色」：目前選用的配色，點一下開啟色彩庫。
  import { paletteOf } from '../core/palettes'
  import { project } from '../core/store.svelte'
  import PalettePicker from './PalettePicker.svelte'

  let open = $state(false)
  const current = $derived(paletteOf(project.palette))
</script>

<button class="current" onclick={() => (open = true)} title="開啟色彩庫">
  {#if current}
    <span class="strip">
      {#each current.colors as c, i (i)}<span style:background={c}></span>{/each}
    </span>
    <span class="name">{current.name}<small>{current.category}</small></span>
  {:else}
    <span class="name">選擇配色…</span>
  {/if}
</button>

<PalettePicker bind:open />

<style>
  .current {
    width: 100%;
    display: grid;
    gap: 6px;
    padding: 8px;
    text-align: left;
  }
  .strip {
    display: flex;
    height: 24px;
    border-radius: 4px;
    overflow: hidden;
  }
  .strip span {
    flex: 1;
  }
  .name {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
  }
  small {
    color: var(--muted);
    font-size: 11px;
  }
</style>
