<script lang="ts">
  // 文字內容：逐條填寫標題、子標題、內文…，下方直接給出排版提案，點一下套用，之後可自由微調。
  import Section from '../../ui/Section.svelte'
  import { CONTENT_ROLES, proposeLayouts, type ContentRole, type SlotSource } from '../../core/autolayout'
  import { projectLayoutInput } from '../../core/layoutInput'
  import type { Pt } from '../../core/geometry'
  import { addContent, addLogo, applyProposal, contentItems, contentText, contentUntouched, isContent, project, removeObject, setContentText, ui } from '../../core/store.svelte'
  import { getAssetUrl, importImageFile } from '../../core/assets'
  import { untrack } from 'svelte'
  import ProposalThumb from './ProposalThumb.svelte'

  interface Props {
    /** 構圖與引導切出的區域（畫布座標） */
    regions: SlotSource[]
    /** 視覺動線上的點（依順序） */
    path: Pt[]
  }
  let { regions, path }: Props = $props()

  const items = $derived(project.objects.items.filter(isContent))

  const proposals = $derived(proposeLayouts(projectLayoutInput(regions, path)))

  // 文字還沒手動調整過時，加入或修改內容後自動沿用上次選的提案重新排版
  const key = $derived(JSON.stringify(contentItems()) + '|' + proposals.map((p) => p.id).join())
  let lastKey = untrack(() => key)
  let timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const k = key
    if (k === lastKey) return
    lastKey = k
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!contentUntouched()) return
      const p = proposals.find((x) => x.id === ui.layoutPref) ?? proposals[0]
      if (p) applyProposal(p)
    }, 350)
    return () => clearTimeout(timer)
  })

  let logoInput: HTMLInputElement
  let error = $state('')
  async function onLogo() {
    const file = logoInput.files?.[0]
    logoInput.value = ''
    if (!file) return
    try {
      const { id, width, height } = await importImageFile(file)
      addLogo(id, width, height)
      error = ''
    } catch (e) {
      error = e instanceof Error ? e.message : '無法讀取圖片'
    }
  }

  const rows = (t: string) => Math.min(6, t.split('\n').length + (t.length > 18 ? 1 : 0))
</script>

<Section id="objects-content" title="文字內容（{items.length}）" help="先填好要放的文字，下方會依構圖與空間給出排版提案；點一下套用，之後可以直接在畫布上微調。">
  {#if items.length}
    <ul class="list">
      {#each items as o (o.uid)}
        <li>
          {#if o.type === 'image'}
            <span class="logo-label">Logo</span>
            <span class="logo-thumb">{#if getAssetUrl(String(o.props.assetId))}<img src={getAssetUrl(String(o.props.assetId))} alt="Logo" />{/if}</span>
          {:else}
            <select value={o.props.role} onchange={(e) => (o.props.role = e.currentTarget.value as ContentRole)} aria-label="用途">
              {#each CONTENT_ROLES.filter((r) => r.id !== 'logo') as r (r.id)}
                <option value={r.id}>{r.label}</option>
              {/each}
            </select>
            <textarea rows={rows(contentText(o))} value={contentText(o)} oninput={(e) => setContentText(o, e.currentTarget.value)}></textarea>
          {/if}
          <button class="del" onclick={() => removeObject(o.uid)} title="刪除">✕</button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="adds">
    {#each CONTENT_ROLES as r (r.id)}
      <button onclick={() => (r.id === 'logo' ? logoInput.click() : addContent(r.id))}>＋{r.label}</button>
    {/each}
  </div>
  <input bind:this={logoInput} type="file" accept="image/*" hidden onchange={onLogo} />
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if proposals.length}
    <div class="proposals">
      {#each proposals as p (p.id)}
        <button class="card" class:on={ui.layoutPref === p.id} onclick={() => applyProposal(p)} title="套用「{p.name}」">
          <ProposalThumb proposal={p} />
          <span>{p.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</Section>

<style>
  .list {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: grid;
    grid-template-columns: 72px 1fr auto;
    gap: 6px;
    align-items: start;
  }
  select {
    font-size: 12px;
    padding: 5px 4px;
  }
  textarea {
    min-width: 0;
    font-size: 13px;
    resize: vertical;
  }
  .logo-label {
    font-size: 12px;
    padding: 5px 4px;
    color: var(--muted);
  }
  .logo-thumb img {
    display: block;
    max-height: 40px;
    max-width: 100%;
    border-radius: 4px;
  }
  .error {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--danger);
  }
  .del {
    border: none;
    background: none;
    color: var(--muted);
    padding: 5px 4px;
  }
  .adds {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .adds button {
    font-size: 12px;
    padding: 4px 8px;
  }
  .proposals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
  }
  .card {
    display: grid;
    gap: 5px;
    padding: 6px;
    font-size: 12px;
  }
  .card:hover:not(:disabled),
  .card.on {
    border-color: var(--accent);
  }
</style>
