<script lang="ts">
  import { project } from '../../core/store.svelte'
  import { IDENTITY, rotateClockwise } from '../../core/transform'
  import ParamPanel from '../../ui/ParamPanel.svelte'
  import { compositionTemplates } from './templates'
  import Thumb from './Thumb.svelte'

  const comp = project.composition
  const template = $derived(compositionTemplates.find((t) => t.id === comp.templateId)!)
  const aspect = $derived(project.canvas.w / project.canvas.h)
</script>

<section>
  <h3>選擇構圖</h3>
  <div class="grid">
    {#each compositionTemplates as t (t.id)}
      <button class="card" class:active={t.id === comp.templateId} onclick={() => (comp.templateId = t.id)} title={t.meta.description}>
        <Thumb template={t} {aspect} orientation={comp.orientation} />
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
  <div class="tools">
    <button class:on={comp.orientation.flipH} onclick={() => (comp.orientation.flipH = !comp.orientation.flipH)}>⇋ 水平翻轉</button>
    <button class:on={comp.orientation.flipV} onclick={() => (comp.orientation.flipV = !comp.orientation.flipV)}>⇵ 垂直翻轉</button>
    <button onclick={() => (comp.orientation = rotateClockwise(comp.orientation))}>↻ 旋轉 90°</button>
    <button onclick={() => (comp.orientation = { ...IDENTITY })}>重設</button>
  </div>
  <p class="hint">目前旋轉 {comp.orientation.rotate}°</p>
</section>

<section>
  <h3>參數</h3>
  <ParamPanel
    schema={template.params}
    bind:values={comp.params[template.id]}
    onreset={() => (comp.params[template.id] = { ...template.defaults })}
  />
  {#if Object.keys(template.params).length === 0}
    <p class="hint">此構圖沒有可調參數。</p>
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
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tools button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .desc,
  .hint {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
