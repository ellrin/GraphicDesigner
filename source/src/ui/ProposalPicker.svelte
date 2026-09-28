<script lang="ts">
  // 排版提案：縮圖列表，點一下套用（第四步「文字內容」與精靈第五步共用）。
  import type { Proposal } from '../core/autolayout'
  import { applyProposal, ui } from '../core/store.svelte'
  import ProposalThumb from '../layers/4-objects/ProposalThumb.svelte'

  let { proposals, columns = 2 }: { proposals: Proposal[]; columns?: number } = $props()
</script>

{#if proposals.length}
  <div class="proposals" style:--cols={columns}>
    {#each proposals as p (p.id)}
      <button class="card" class:on={ui.layoutPref === p.id} onclick={() => applyProposal(p)} title="套用「{p.name}」">
        <ProposalThumb proposal={p} />
        <span>{p.name}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .proposals {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
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
