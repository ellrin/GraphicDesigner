<script lang="ts">
  // 依區塊放物件：每個區塊一鍵放入照片（依區塊形狀裁切）或填色；文字由「文字內容」的排版自動放進文字區塊。
  import Section from '../../ui/Section.svelte'
  import { importImageFile } from '../../core/assets'
  import { roleOf } from '../../core/blocks'
  import { blockFill, fillBlock, placePhotoInBlock, project, removeObject } from '../../core/store.svelte'

  const blocks = $derived(project.blocks.items.filter((b) => b.visible))
  let input: HTMLInputElement | undefined = $state()
  let target: string | null = null
  let error = $state('')

  async function onFile() {
    const file = input?.files?.[0]
    if (input) input.value = ''
    if (!file || !target) return
    try {
      const { id } = await importImageFile(file)
      placePhotoInBlock(target, id)
      error = ''
    } catch (e) {
      error = e instanceof Error ? e.message : '無法讀取圖片'
    }
  }
</script>

{#if blocks.length}
  <Section id="objects-blocks" title="區塊（{blocks.length}）" help="依第三步的區塊一鍵放入物件：照片會依區塊形狀裁切，填色使用目前的配色。文字請在「文字內容」輸入，排版會自動放進文字區塊。">
    <ul class="list">
      {#each blocks as b (b.uid)}
        {@const f = blockFill(b.uid)}
        <li>
          <span class="dot" style:background={roleOf(b.role).color}></span>
          <span class="name">{b.name || roleOf(b.role).label}<small>{roleOf(b.role).label}</small></span>
          {#if f.photo}
            <button class="on" onclick={() => removeObject(f.photo!.uid)} title="移除照片">✓ 照片</button>
          {:else}
            <button onclick={() => ((target = b.uid), input?.click())}>＋照片</button>
          {/if}
          {#if f.panel}
            <button class="on" onclick={() => removeObject(f.panel!.uid)} title="移除色塊">✓ 色塊</button>
          {:else}
            <button onclick={() => fillBlock(b.uid)}>填色</button>
          {/if}
        </li>
      {/each}
    </ul>
    <input bind:this={input} type="file" accept="image/*" hidden onchange={onFile} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </Section>
{/if}

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .name {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .name small {
    color: var(--muted);
    font-size: 11px;
  }
  li button {
    font-size: 12px;
    padding: 3px 8px;
  }
  li button.on {
    border-color: var(--ok);
    color: var(--ok);
  }
  .error {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--danger);
  }
</style>
