<script lang="ts">
  import { project } from '../../core/store.svelte'
  import OrientationTools from '../../ui/OrientationTools.svelte'
  import ParamPanel from '../../ui/ParamPanel.svelte'
  import TemplateThumb from '../../ui/TemplateThumb.svelte'
  import theme from '../../config/theme.json'
  import { compositionTemplates } from './templates'

  const comp = $derived(project.composition)
  const template = $derived(compositionTemplates.find((t) => t.id === comp.templateId)!)
  const aspect = $derived(project.canvas.w / project.canvas.h)
  const colors = { main: theme.guides.composition.mainColor, sub: theme.guides.composition.subColor }
</script>

<section>
  <h3>選擇構圖</h3>
  <div class="grid">
    {#each compositionTemplates as t (t.id)}
      <button class="card" class:active={t.id === comp.templateId} onclick={() => (comp.templateId = t.id)} title={t.meta.description}>
        <TemplateThumb template={t} {aspect} orientation={comp.orientation} {colors} />
        <span>{t.meta.name}</span>
      </button>
    {/each}
  </div>
  {#if template.meta.description}
    <p class="desc">{template.meta.description}</p>
  {/if}
</section>

<section>
  <h3>方向</h3>
  <OrientationTools bind:orientation={comp.orientation} />
</section>

<section>
  <h3>參數</h3>
  <ParamPanel
    schema={template.params}
    bind:values={comp.params[template.id]}
    onreset={() => (comp.params[template.id] = structuredClone(template.defaults))}
  />
  {#if Object.keys(template.params).length === 0}
    <p class="desc">此構圖沒有可調參數。</p>
  {/if}
</section>

<style>
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
