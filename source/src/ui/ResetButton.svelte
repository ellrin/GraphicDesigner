<script lang="ts">
  // 頂部的「重設」：確認後清除所有內容、回到第一步（畫布尺寸保留），介面區塊全部收合。
  import { resetProject } from '../core/persistence.svelte'
  import { resetAccordion } from './accordionState.svelte'

  let dialog: HTMLDialogElement

  function confirm() {
    resetProject()
    resetAccordion()
    dialog.close()
  }
</script>

<button onclick={() => dialog.showModal()} title="清除所有內容，重新開始">重設</button>

<dialog bind:this={dialog}>
  <h4>重設目前的設計？</h4>
  <p>構圖、視覺引導、區塊、物件與背景都會清除，回到第一步；畫布尺寸保留。重設後無法復原。</p>
  <div class="tools">
    <button onclick={() => dialog.close()}>取消</button>
    <button class="danger" onclick={confirm}>重設</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(380px, calc(100vw - 32px));
    padding: 20px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--panel);
    color: var(--text);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.55);
  }
  h4 {
    margin: 0 0 8px;
    font-size: 15px;
  }
  p {
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted);
  }
  .tools {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .danger {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
    font-weight: 700;
  }
</style>
