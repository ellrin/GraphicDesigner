<script lang="ts">
  import { addGuide, project, removeGuide, ui } from '../../core/store.svelte'
  import OrientationTools from '../../ui/OrientationTools.svelte'
  import ParamPanel from '../../ui/ParamPanel.svelte'
  import TemplateThumb from '../../ui/TemplateThumb.svelte'
  import theme from '../../config/theme.json'
  import { IDENTITY } from '../../core/transform'
  import { guideTemplates } from './templates'

  const items = $derived(project.guides.items)
  const selected = $derived(items.find((g) => g.uid === ui.selectedGuide))
  const selectedTemplate = $derived(selected && guideTemplates.find((t) => t.id === selected.templateId))
  const hasPoints = $derived(selectedTemplate && Object.values(selectedTemplate.params).some((s) => s.type === 'point'))
  const aspect = $derived(project.canvas.w / project.canvas.h)
  const colors = { main: theme.guides.visual.mainColor, sub: theme.guides.visual.subColor }
  const nameOf = (id: string) => guideTemplates.find((t) => t.id === id)?.meta.name ?? id
</script>

<section>
  <h3>已加入的引導（{items.length}）</h3>
  {#if items.length === 0}
    <p class="desc">從下方選擇要加入的視覺引導，可以疊加多種。</p>
  {:else}
    <ul class="items">
      {#each items as g (g.uid)}
        <li class:on={g.uid === ui.selectedGuide}>
          <input type="checkbox" bind:checked={g.visible} title="顯示／隱藏" />
          <button class="name" onclick={() => (ui.selectedGuide = g.uid)}>{nameOf(g.templateId)}</button>
          <button class="del" onclick={() => removeGuide(g.uid)} title="移除">✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if selected && selectedTemplate}
  <section>
    <h3>{selectedTemplate.meta.name}</h3>
    {#if selectedTemplate.meta.description}
      <p class="desc">{selectedTemplate.meta.description}</p>
    {/if}
    {#if hasPoints}
      <p class="tip">可直接在畫布上拖曳白色控制點；靠近構圖錨點時會變紫色並自動吸附。</p>
    {/if}
  </section>
  <section>
    <h3>方向</h3>
    <OrientationTools bind:orientation={selected.orientation} />
  </section>
  <section>
    <h3>參數</h3>
    <ParamPanel
      schema={selectedTemplate.params}
      bind:values={selected.params}
      onreset={() => {
        selected.params = structuredClone(selectedTemplate.defaults)
        selected.orientation = { ...IDENTITY }
      }}
    />
  </section>
{/if}

<section>
  <h3>新增引導</h3>
  <div class="grid">
    {#each guideTemplates as t (t.id)}
      <button class="card" onclick={() => addGuide(t.id)} title={t.meta.description}>
        <TemplateThumb template={t} {aspect} orientation={IDENTITY} {colors} />
        <span>＋ {t.meta.name}</span>
      </button>
    {/each}
  </div>
</section>

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
  .desc,
  .tip {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .tip {
    color: var(--accent);
  }
</style>
