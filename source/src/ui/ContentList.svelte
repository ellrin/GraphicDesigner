<script lang="ts">
  // 內容清單：逐條填寫標題、子標題、內文、價目…（可排序）；精靈第二步與第四步「文字內容」共用。
  import { CONTENT_ROLES, type ContentRole } from '../core/autolayout'
  import { addContent, addLogo, moveContent, contentText, isContent, project, removeObject, setContentText, ui } from '../core/store.svelte'

  /** editable：顯示「✎」按鈕，點一下選取物件並打開詳細設定（精靈中不顯示） */
  let { editable = false }: { editable?: boolean } = $props()
  import { getAssetUrl, importImageFile } from '../core/assets'

  const items = $derived(project.objects.items.filter(isContent))

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

  {#if items.length}
    <ul class="list">
      {#each items as o, i (o.uid)}
        <li class:on={ui.selectedObjects.includes(o.uid)}>
          <span class="order">
            <button onclick={() => moveContent(o.uid, -1)} disabled={i === 0} title="上移">↑</button>
            <button onclick={() => moveContent(o.uid, 1)} disabled={i === items.length - 1} title="下移">↓</button>
          </span>
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
          <span class="acts">
            {#if editable}<button class="edit" onclick={() => (ui.selectedObjects = [o.uid])} title="選取並編輯字型、顏色、位置">✎</button>{/if}
            <button class="del" onclick={() => removeObject(o.uid)} title="刪除">✕</button>
          </span>
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
    grid-template-columns: auto 64px 1fr auto;
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
  .order {
    display: grid;
    gap: 1px;
  }
  .order button {
    border: none;
    background: none;
    padding: 0 2px;
    font-size: 11px;
    line-height: 1.2;
    color: var(--muted);
  }
  .order button:disabled {
    opacity: 0.25;
  }
  li.on {
    outline: 1px solid var(--accent);
    outline-offset: 3px;
    border-radius: 4px;
  }
  .acts {
    display: grid;
  }
  .edit {
    border: none;
    background: none;
    color: var(--muted);
    padding: 3px 4px;
  }
  .edit:hover:not(:disabled) {
    color: var(--accent);
    background: none;
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
</style>
