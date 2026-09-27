<script lang="ts">
  // 頂部的快速操作：復原、重做（專案檔、匯出等跨步驟設定在右側面板）。
  import { history, redo, undo } from '../core/history.svelte'

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl+'
</script>

<div class="menu">
  <button onclick={undo} disabled={!history.canUndo} title="復原（{mod}Z）">↶</button>
  <button onclick={redo} disabled={!history.canRedo} title="重做（{mod}⇧Z）">↷</button>
</div>

<style>
  .menu {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
