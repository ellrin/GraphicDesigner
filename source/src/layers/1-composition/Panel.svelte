<script lang="ts">
  import Section from '../../ui/Section.svelte'
  import { CANVAS_FRAME, frameLabel, resolveFrame } from '../../core/instances'
  import { addComposition, project, removeComposition, setInstanceTemplate, startFromRecipe, ui } from '../../core/store.svelte'
  import type { Recipe } from '../../core/recipes'
  import RecipeGallery from '../../ui/RecipeGallery.svelte'
  import FrameSelect, { type RegionOption } from '../../ui/FrameSelect.svelte'
  import OrientationTools from '../../ui/OrientationTools.svelte'
  import ParamPanel from '../../ui/ParamPanel.svelte'
  import TemplateThumb from '../../ui/TemplateThumb.svelte'
  import theme from '../../config/theme.json'
  import { IDENTITY } from '../../core/transform'
  import Help from '../../ui/Help.svelte'
  import { compositionTemplates } from './templates'

  let { regions }: { regions: RegionOption[] } = $props()

  const items = $derived(project.compositions.items)
  // 沒有選取時，預設編輯第一個構圖
  const selected = $derived(items.find((c) => c.uid === ui.selectedComposition) ?? items[0])
  const template = $derived(selected && compositionTemplates.find((t) => t.id === selected.templateId))
  const nameOf = (id: string) => compositionTemplates.find((t) => t.id === id)?.meta.name ?? id
  const colors = { main: theme.guides.composition.mainColor, sub: theme.guides.composition.subColor }

  /** 新增構圖：先選好構圖才加入；還沒有任何構圖時直接顯示選單 */
  let adding = $state(false)
  const picking = $derived(adding || items.length === 0)

  /** 重置：套用範圍、方向與參數回到預設（類型不變） */
  function reset() {
    if (!selected || !template) return
    selected.frame = { ...CANVAS_FRAME }
    selected.orientation = { ...IDENTITY }
    selected.params = structuredClone(template.defaults)
  }

  // 從範例開始：選好範例後套用，直接前往插入物件
  let recipe = $state<Recipe | null>(null)
  const hasWork = $derived(items.length > 0 || project.guides.items.length > 0 || project.blocks.items.length > 0)

  function add(id: string) {
    addComposition(id)
    adding = false
  }

  // 縮圖依「套用範圍」的比例繪製
  const aspect = $derived.by(() => {
    if (!selected || picking) return project.canvas.w / project.canvas.h
    const r = resolveFrame(selected.frame, project.canvas, project.blocks.items)
    return r.w / r.h
  })
  // 範圍選單不列出自己切出的區域（避免套到自己身上）
  const otherRegions = $derived(regions.filter((r) => r.source !== selected?.uid))
</script>

<Section id="comp-1" title="構圖（{items.length}）" help="可以疊加多個構圖，並把構圖套用在某個區域上，例如先用黃金分割切出右欄，再在右欄放一個黃金螺旋。">
  {#if items.length > 0}
    <ul class="items">
      {#each items as c (c.uid)}
        <li class:on={!picking && c.uid === selected?.uid}>
          <input type="checkbox" bind:checked={c.visible} title="顯示／隱藏" />
          <button class="name" onclick={() => ((ui.selectedComposition = c.uid), (adding = false))}>
            {nameOf(c.templateId)}<small>{frameLabel(c.frame, project.blocks.items)}</small>
          </button>
          <button class="icon" onclick={() => removeComposition(c.uid)} title="移除">✕</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if items.length > 0}
    <button class="add" class:open={adding} onclick={() => (adding = !adding)}>{adding ? '取消新增' : '＋ 新增構圖'}</button>
  {/if}
  {#if picking}
    <div class="grid picker">
      {#each compositionTemplates as t (t.id)}
        <button class="card" onclick={() => add(t.id)} title={t.meta.description}>
          <TemplateThumb template={t} {aspect} orientation={IDENTITY} {colors} />
          <span>{t.meta.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</Section>

{#if !picking && selected && template}
  <Section id="comp-2" title="調整：{template.meta.name}" help={template.meta.description}>
    <div class="field">
      <span>構圖類型</span>
      <select value={selected.templateId} onchange={(e) => { const t = compositionTemplates.find((x) => x.id === e.currentTarget.value); if (t) setInstanceTemplate(selected, t) }}>
        {#each compositionTemplates as t (t.id)}
          <option value={t.id}>{t.meta.name}</option>
        {/each}
      </select>
    </div>
    <div class="field">
      <span>套用範圍 <Help text="構圖可以套用在整張畫布、某個區塊，或其他構圖切出的區域（會跟著來源構圖連動）。" /></span>
      <FrameSelect frame={selected.frame} regions={otherRegions} onchange={(f) => (selected.frame = f)} />
    </div>
    <button class="reset" onclick={reset}>重置此構圖</button>
  </Section>

  <Section id="comp-4" title="方向">
    <OrientationTools bind:orientation={selected.orientation} />
  </Section>

  <Section id="comp-5" title="參數">
    <ParamPanel schema={template.params} bind:values={selected.params} onreset={() => (selected.params = structuredClone(template.defaults))} />
    {#if Object.keys(template.params).length === 0}
      <p class="desc">此構圖沒有可調參數。</p>
    {/if}
  </Section>
{/if}

<Section id="comp-recipes" title="從範例開始" help="套用範例的構圖、視覺引導與區塊，直接前往「插入物件」；之後仍可回到前面的步驟調整。">
  <RecipeGallery aspect={project.canvas.w / project.canvas.h} selected={recipe} onpick={(r) => (recipe = r)} min={120} />
  {#if recipe}
    <div class="apply">
      <strong>{recipe.name}</strong>
      {#if hasWork}<p class="warn">會取代目前的構圖、視覺引導與區塊（物件與背景保留，可以復原）。</p>{/if}
      <button class="primary" onclick={() => recipe && startFromRecipe(recipe)}>套用並前往插入物件</button>
    </div>
  {/if}
</Section>

<style>
  .items {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .items li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .items li.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    text-align: left;
    border: none;
    background: none;
    padding: 2px 0;
  }
  .name small {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .icon {
    border: none;
    background: none;
    color: var(--muted);
    padding: 2px 6px;
  }
  .add {
    width: 100%;
  }
  .add.open {
    color: var(--muted);
  }
  .reset {
    width: 100%;
  }
  .apply {
    position: sticky;
    bottom: 70px;
    display: grid;
    gap: 6px;
    margin-top: 10px;
    padding: 10px;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 13px;
  }
  .apply .warn {
    margin: 0;
    font-size: 12px;
    color: var(--highlight);
  }
  .picker {
    margin-top: 8px;
  }
  .field {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 13px;
  }
  .field > span {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 8px;
  }
  .card {
    display: grid;
    gap: 6px;
    padding: 8px;
    font-size: 12px;
    text-align: center;
  }
  .desc {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
