<script lang="ts">
  // 版型範例清單（依構圖篩選）：新專案視窗與第一步共用。
  import { RECIPES, type Recipe } from '../core/recipes'
  import { compositionTemplates } from '../layers/1-composition/templates'
  import RecipeThumb from './RecipeThumb.svelte'

  interface Props {
    aspect: number
    selected: Recipe | null
    onpick: (r: Recipe) => void
    /** 格子最小寬度（px） */
    min?: number
  }
  let { aspect, selected, onpick, min = 150 }: Props = $props()

  let group = $state('all')
  const groups = [...new Set(RECIPES.map((r) => r.group))]
  const groupName = (id: string) => compositionTemplates.find((t) => t.id === id)?.meta.name ?? id
  const list = $derived(group === 'all' ? RECIPES : RECIPES.filter((r) => r.group === group))
</script>

<div class="chips">
  <button class:on={group === 'all'} onclick={() => (group = 'all')}>全部</button>
  {#each groups as g (g)}
    <button class:on={group === g} onclick={() => (group = g)}>{groupName(g)}</button>
  {/each}
</div>
<div class="grid" style:--min="{min}px">
  {#each list as r (r.id)}
    <button class="card" class:on={selected?.id === r.id} onclick={() => onpick(r)} title={r.description}>
      <RecipeThumb recipe={r} {aspect} />
      <span class="name">{r.name}</span>
      <small>{groupName(r.group)}</small>
    </button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .chips button {
    padding: 3px 10px;
    font-size: 12px;
    border-radius: 999px;
  }
  .chips button.on {
    border-color: var(--accent);
    color: var(--text);
    background: var(--accent-soft);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--min), 1fr));
    gap: 8px;
  }
  .card {
    display: grid;
    gap: 6px;
    padding: 8px;
    text-align: left;
    align-content: start;
  }
  .card.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .name {
    font-size: 12px;
    line-height: 1.35;
  }
  .card small {
    font-size: 11px;
    color: var(--muted);
  }
</style>
