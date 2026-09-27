<script lang="ts">
  import { project } from '../core/store.svelte'
  import { guideTemplates } from '../layers/2-guides/templates'

  const v = $derived(project.visibility)
  const nameOf = (id: string) => guideTemplates.find((t) => t.id === id)?.meta.name ?? id
</script>

<ul class="layers">
  <li>
    <label><input type="checkbox" bind:checked={v.composition} /> ① 空間構圖線</label>
  </li>
  <li class="child">
    <label><input type="checkbox" bind:checked={v.anchors} /> 錨點</label>
  </li>
  <li>
    <label><input type="checkbox" bind:checked={v.guides} /> ② 視覺引導</label>
  </li>
  {#each project.guides.items as g (g.uid)}
    <li class="child">
      <label><input type="checkbox" bind:checked={g.visible} disabled={!v.guides} /> {nameOf(g.templateId)}</label>
    </li>
  {/each}
  <li class="todo">③ 區塊分佈（開發中）</li>
  <li class="todo">④ 物件（開發中）</li>
</ul>

<style>
  .layers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    font-size: 13px;
  }
  .child {
    padding-left: 20px;
  }
  .todo {
    color: var(--muted);
    opacity: 0.6;
    padding-left: 22px;
  }
</style>
