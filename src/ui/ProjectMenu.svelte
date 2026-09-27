<script lang="ts">
  // 頂部的快速操作：復原、重做、儲存。開啟與新專案在側欄的「專案檔」區域。
  import { history, redo, undo } from '../core/history.svelte'
  import { downloadProject } from '../core/persistence.svelte'

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl+'
</script>

<div class="menu">
  <button onclick={undo} disabled={!history.canUndo} title="復原（{mod}Z）">↶</button>
  <button onclick={redo} disabled={!history.canRedo} title="重做（{mod}⇧Z）">↷</button>
  <span class="sep"></span>
  <button onclick={downloadProject} title="儲存專案檔（{mod}S）">儲存</button>
</div>

<style>
  .menu {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: var(--line);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
