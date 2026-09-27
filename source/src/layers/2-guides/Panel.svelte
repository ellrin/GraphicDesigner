<script lang="ts">
  import Section from '../../ui/Section.svelte'
  import { addGuide, project, removeGuide, ui } from '../../core/store.svelte'
  import OrientationTools from '../../ui/OrientationTools.svelte'
  import FrameSelect, { type RegionOption } from '../../ui/FrameSelect.svelte'
  import { frameLabel } from '../../core/instances'
  import ParamPanel from '../../ui/ParamPanel.svelte'
  import TemplateThumb from '../../ui/TemplateThumb.svelte'
  import theme from '../../config/theme.json'
  import { IDENTITY } from '../../core/transform'
  import { guideTemplates } from './templates'

  let { regions }: { regions: RegionOption[] } = $props()

  const items = $derived(project.guides.items)
  const selected = $derived(items.find((g) => g.uid === ui.selectedGuide))
  const selectedTemplate = $derived(selected && guideTemplates.find((t) => t.id === selected.templateId))
  const hasPoints = $derived(selectedTemplate && Object.values(selectedTemplate.params).some((s) => s.type === 'point'))
  const aspect = $derived(project.canvas.w / project.canvas.h)
  const colors = { main: theme.guides.visual.mainColor, sub: theme.guides.visual.subColor }
  const nameOf = (id: string) => guideTemplates.find((t) => t.id === id)?.meta.name ?? id

  /** 新增引導：先選好類型才加入；還沒有任何引導時直接顯示選單 */
  let adding = $state(false)
  const picking = $derived(adding || items.length === 0)

  function add(id: string) {
    addGuide(id)
    adding = false
  }
</script>

<Section id="guides-1" title="視覺引導（{items.length}）" help="可以疊加多種視覺引導；這一步也可以跳過。">
  {#if items.length > 0}
    <ul class="items">
      {#each items as g (g.uid)}
        <li class:on={!picking && g.uid === ui.selectedGuide}>
          <input type="checkbox" bind:checked={g.visible} title="顯示／隱藏" />
          <button class="name" onclick={() => ((ui.selectedGuide = g.uid), (adding = false))}>
            {nameOf(g.templateId)}<small>{frameLabel(g.frame, project.blocks.items)}</small>
          </button>
          <button class="del" onclick={() => removeGuide(g.uid)} title="移除">✕</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if !picking}
    <button class="add" onclick={() => (adding = true)}>＋ 新增引導</button>
  {/if}
</Section>

{#if picking}
  <Section id="guides-add" title={items.length ? '選擇要新增的引導' : '選擇視覺引導'}>
    <div class="grid">
      {#each guideTemplates as t (t.id)}
        <button class="card" onclick={() => add(t.id)} title={t.meta.description}>
          <TemplateThumb template={t} {aspect} orientation={IDENTITY} {colors} />
          <span>{t.meta.name}</span>
        </button>
      {/each}
    </div>
    {#if items.length > 0}
      <button class="add cancel" onclick={() => (adding = false)}>取消</button>
    {/if}
  </Section>
{:else if selected && selectedTemplate}
  <Section id="guides-3" title="套用範圍">
    <FrameSelect frame={selected.frame} regions={regions.filter((r) => r.source !== selected.uid)} onchange={(f) => (selected.frame = f)} />
  </Section>
  <Section id="guides-4" title="方向">
    <OrientationTools bind:orientation={selected.orientation} />
  </Section>
  <Section
    id="guides-5"
    title="參數：{selectedTemplate.meta.name}"
    help={(selectedTemplate.meta.description ?? '') + (hasPoints ? '　可直接在畫布上拖曳白色控制點；靠近構圖錨點時會變紫色並自動吸附。' : '')}
  >
    <ParamPanel
      schema={selectedTemplate.params}
      bind:values={selected.params}
      onreset={() => {
        selected.params = structuredClone(selectedTemplate.defaults)
        selected.orientation = { ...IDENTITY }
      }}
    />
  </Section>
{/if}

<style>
  .items {
    list-style: none;
    margin: 0;
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
    border-radius: 6px;
    background: var(--surface);
  }
  .items li.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .name small {
    color: var(--muted);
    margin-left: 8px;
    font-size: 12px;
  }
  .name {
    flex: 1;
    text-align: left;
    border: none;
    background: none;
    padding: 2px 0;
  }
  .del {
    border: none;
    background: none;
    color: var(--muted);
    padding: 2px 6px;
  }
  .add {
    width: 100%;
    margin-top: 8px;
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
</style>
