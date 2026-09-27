<script lang="ts">
  import { applyTheme, uiTheme, UI_THEMES } from './theme.svelte'
</script>

<div class="themes" role="radiogroup" aria-label="介面主題">
  {#each UI_THEMES as t (t.id)}
    <button
      role="radio"
      aria-checked={uiTheme.id === t.id}
      class:on={uiTheme.id === t.id}
      onclick={() => applyTheme(t.id)}
      title="介面主題：{t.name}"
    >
      <span class="sw">
        {#each t.swatches as c (c)}<i style:background={c}></i>{/each}
      </span>
      <span class="name">{t.name}</span>
    </button>
  {/each}
</div>

<style>
  .themes {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid transparent;
    background: none;
    padding: 4px 8px;
    font-size: 12px;
    color: var(--muted);
  }
  button.on {
    border-color: var(--accent);
    color: var(--text);
    background: var(--accent-soft);
  }
  .sw {
    display: inline-flex;
  }
  .sw i {
    width: 9px;
    height: 14px;
    display: block;
  }
  .sw i:first-child {
    outline: 1px solid var(--line-strong);
  }
  @media (max-width: 1100px) {
    .name {
      display: none;
    }
  }
</style>
