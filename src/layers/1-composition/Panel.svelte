<script lang="ts">
  import Section from '../../ui/Section.svelte'
  import { frameLabel, resolveFrame } from '../../core/instances'
  import { addComposition, project, removeComposition, setInstanceTemplate, ui } from '../../core/store.svelte'
  import FrameSelect, { type RegionOption } from '../../ui/FrameSelect.svelte'
  import OrientationTools from '../../ui/OrientationTools.svelte'
  import ParamPanel from '../../ui/ParamPanel.svelte'
  import TemplateThumb from '../../ui/TemplateThumb.svelte'
  import theme from '../../config/theme.json'
  import { compositionTemplates } from './templates'
  import RecipePanel from './RecipePanel.svelte'

  let { regions }: { regions: RegionOption[] } = $props()

  const items = $derived(project.compositions.items)
  // 沒有選取時，預設編輯第一個構圖
  const selected = $derived(items.find((c) => c.uid === ui.selectedComposition) ?? items[0])
  const template = $derived(selected && compositionTemplates.find((t) => t.id === selected.templateId))
  const nameOf = (id: string) => compositionTemplates.find((t) => t.id === id)?.meta.name ?? id
  const colors = { main: theme.guides.composition.mainColor, sub: theme.guides.composition.subColor }

  // 縮圖依「套用範圍」的比例繪製
  const aspect = $derived.by(() => {
    if (!selected) return project.canvas.w / project.canvas.h
    const r = resolveFrame(selected.frame, project.canvas, project.blocks.items)
    return r.w / r.h
  })
  // 範圍選單不列出自己切出的區域（避免套到自己身上）
  const otherRegions = $derived(regions.filter((r) => r.source !== selected?.uid))
</script>

<Section id="comp-1" title="構圖（{items.length}）">
  <p class="tip">可以疊加多個構圖，並把構圖套用在某個區域上，例如先用黃金分割切出右欄，再在右欄放一個黃金螺旋。</p>
  <ul class="items">
    {#each items as c (c.uid)}
      <li class:on={c.uid === selected?.uid}>
        <input type="checkbox" bind:checked={c.visible} title="顯示／隱藏" />
        <button class="name" onclick={() => (ui.selectedComposition = c.uid)}>
          {nameOf(c.templateId)}<small>{frameLabel(c.frame, project.blocks.items)}</small>
        </button>
        {#if items.length > 1}
          <button class="icon" onclick={() => removeComposition(c.uid)} title="移除">✕</button>
        {/if}
      </li>
    {/each}
  </ul>
  <button class="add" onclick={() => addComposition(selected?.templateId ?? compositionTemplates[0].id)}>＋ 再加一個構圖</button>
</Section>

<RecipePanel group={selected?.templateId ?? compositionTemplates[0].id} />

{#if selected && template}
  <Section id="comp-2" title="套用範圍">
    <FrameSelect frame={selected.frame} regions={otherRegions} onchange={(f) => (selected.frame = f)} />
  </Section>

  <Section id="comp-3" title="選擇構圖">
    <div class="grid">
      {#each compositionTemplates as t (t.id)}
        <button class="card" class:active={t.id === selected.templateId} onclick={() => t.id !== selected.templateId && setInstanceTemplate(selected, t)} title={t.meta.description}>
          <TemplateThumb template={t} {aspect} orientation={selected.orientation} {colors} />
          <span>{t.meta.name}</span>
        </button>
      {/each}
    </div>
    {#if template.meta.description}
      <p class="desc">{template.meta.description}</p>
    {/if}
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

<style>
  .tip {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--muted);
  }
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
  .card.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .desc {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
