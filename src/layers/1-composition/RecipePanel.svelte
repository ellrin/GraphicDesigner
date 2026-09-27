<script lang="ts">
  import Section from '../../ui/Section.svelte'
  // 版型範例：一鍵套用構圖＋區塊（依你提供的書中範例整理，只有版型，沒有圖片與文字內容）。
  import { CANVAS_PRESETS } from '../../core/canvas'
  import { RECIPES, type Recipe } from '../../core/recipes'
  import { applyRecipe, project, ui } from '../../core/store.svelte'
  import RecipeThumb from '../../ui/RecipeThumb.svelte'
  import Help from '../../ui/Help.svelte'
  import { compositionTemplates } from './templates'

  let { group }: { group: string } = $props()

  let picked = $state<Recipe | null>(null)
  let confirming = $state(false)

  const list = $derived(ui.showAllRecipes ? RECIPES : RECIPES.filter((r) => r.group === group))
  const aspect = $derived(project.canvas.w / project.canvas.h)
  const groupName = (id: string) => compositionTemplates.find((t) => t.id === id)?.meta.name ?? id
  const presetName = (id?: string) => CANVAS_PRESETS.find((p) => p.id === id)?.name
  const hasWork = $derived(project.blocks.items.length > 0 || project.compositions.items.length > 1 || project.guides.items.length > 0)

  function apply(withCanvas: boolean) {
    if (!picked) return
    if (hasWork && !confirming) {
      confirming = true
      pendingCanvas = withCanvas
      return
    }
    applyRecipe(picked, withCanvas)
    confirming = false
  }
  let pendingCanvas = false
</script>

<Section id="recipes-1" title="版型範例（{list.length}）" help="一鍵套用構圖與已標好用途的區塊（依書中範例整理，只有版型），之後可以照流程自由調整。">
  <label class="inline"><input type="checkbox" bind:checked={ui.showAllRecipes} /> 顯示所有構圖的範例</label>

  {#if list.length === 0}
    <p class="tip">「{groupName(group)}」還沒有範例。</p>
  {:else}
    <div class="grid">
      {#each list as r (r.id)}
        <button class="card" class:on={picked?.id === r.id} onclick={() => ((picked = r), (confirming = false))} title={r.description}>
          <RecipeThumb recipe={r} {aspect} />
          <span class="name">{r.name}</span>
          {#if ui.showAllRecipes}<small>{groupName(r.group)}</small>{/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if picked}
    <div class="detail">
      <div class="title-row">
        <strong>{picked.name}</strong>
        {#if picked.description}<Help text={picked.description} />{/if}
      </div>
      <p class="roles">區塊：{picked.blocks.map((b) => b.name).join('、')}</p>
      {#if confirming}
        <p class="warn">會取代目前的構圖、視覺引導與區塊（已放的物件與背景會保留，也可以復原）。</p>
        <div class="tools">
          <button class="primary" onclick={() => apply(pendingCanvas)}>確定套用</button>
          <button onclick={() => (confirming = false)}>取消</button>
        </div>
      {:else}
        <div class="tools">
          <button class="primary" onclick={() => apply(false)}>套用到目前畫布</button>
          {#if picked.canvas && picked.canvas !== project.canvas.presetId}
            <button onclick={() => apply(true)}>連同畫布（{presetName(picked.canvas)}）套用</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</Section>

<style>
  .tip {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .card {
    display: grid;
    gap: 6px;
    padding: 8px;
    text-align: left;
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
  .detail {
    margin-top: 10px;
    padding: 10px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    display: grid;
    gap: 6px;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .detail p {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .detail .warn {
    color: var(--highlight);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
