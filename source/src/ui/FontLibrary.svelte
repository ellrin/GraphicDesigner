<script lang="ts">
  // 字型庫清單：分語言、分類，捲動到才下載該字型的預覽字形。
  import { FONT_GROUPS, loadPreview, previewFamily, type FontDef } from '../core/fonts'

  interface Props {
    selected?: string
    onselect?: (f: FontDef) => void
  }
  let { selected, onselect }: Props = $props()

  let groupId = $state<'zh-tc' | 'en'>('zh-tc')
  let category = $state('全部')
  let sample = $state('')

  const group = $derived(FONT_GROUPS.find((g) => g.id === groupId)!)
  const categories = $derived(['全部', ...new Set(group.fonts.map((f) => f.category))])
  const fonts = $derived(category === '全部' ? group.fonts : group.fonts.filter((f) => f.category === category))
  // 停止輸入一段時間後才更新預覽，避免每打一個字就重新下載
  let settled = $state('')
  $effect(() => {
    const v = sample.trim()
    const t = setTimeout(() => (settled = v), 400)
    return () => clearTimeout(t)
  })
  const text = $derived(settled || group.sample)

  let ready = $state<Record<string, boolean>>({})
  let offline = $state(false)

  function inview(node: HTMLElement, f: FontDef) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t = text
      loadPreview(f, t).then((ok) => {
        if (ok) ready[`${f.family}|${t}`] = true
        else offline = true
      })
    })
    io.observe(node)
    return { destroy: () => io.disconnect() }
  }

  function switchGroup(id: 'zh-tc' | 'en') {
    groupId = id
    category = '全部'
  }
</script>

<div class="lib">
  <div class="tabs">
    {#each FONT_GROUPS as g (g.id)}
      <button class:on={g.id === groupId} onclick={() => switchGroup(g.id)}>{g.label}（{g.fonts.length}）</button>
    {/each}
  </div>

  <div class="chips">
    {#each categories as c (c)}
      <button class:on={c === category} onclick={() => (category = c)}>{c}</button>
    {/each}
  </div>

  <input class="sample" placeholder="輸入預覽文字…" bind:value={sample} />

  {#if offline}
    <p class="note">目前無法連線到 Google Fonts，預覽以系統字型顯示。</p>
  {/if}

  <ul>
    {#each fonts as f (f.family + text)}
      <li>
        <button class="font" class:on={f.family === selected} use:inview={f} onclick={() => onselect?.(f)}>
          <span
            class="preview"
            style:font-family={ready[`${f.family}|${text}`] ? `'${previewFamily(f)}', sans-serif` : 'inherit'}
            style:opacity={ready[`${f.family}|${text}`] ? 1 : 0.35}>{text}</span
          >
          <span class="meta">{f.label} · {f.category} · {f.weights.length} 種字重 · {f.license}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .lib {
    display: grid;
    gap: 8px;
  }
  .tabs,
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chips button {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
  }
  button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .sample {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 9px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .font {
    width: 100%;
    display: grid;
    gap: 2px;
    text-align: left;
    padding: 8px 10px;
  }
  .font.on {
    box-shadow: 0 0 0 1px var(--accent);
  }
  .preview {
    font-size: 20px;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: opacity 0.2s;
  }
  .meta,
  .note {
    font-size: 11px;
    color: var(--muted);
    margin: 0;
  }
</style>
