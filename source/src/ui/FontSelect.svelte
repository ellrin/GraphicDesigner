<script lang="ts">
  // 字型下拉選單：依語言、分類分組，選項名稱同時顯示中文名與字型名稱。
  import { FONT_GROUPS } from '../core/fonts'

  interface Props {
    value: string
    onchange: (family: string) => void
  }
  let { value, onchange }: Props = $props()
</script>

<select {value} onchange={(e) => onchange(e.currentTarget.value)} aria-label="字型">
  {#each FONT_GROUPS as g (g.id)}
    {#each [...new Set(g.fonts.map((f) => f.category))] as cat (cat)}
      <optgroup label="{g.label}・{cat}">
        {#each g.fonts.filter((f) => f.category === cat) as f (f.family)}
          <option value={f.family}>{f.label === f.family ? f.family : `${f.label}（${f.family}）`}</option>
        {/each}
      </optgroup>
    {/each}
  {/each}
</select>

<style>
  select {
    width: 100%;
  }
</style>
