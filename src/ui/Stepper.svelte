<script lang="ts">
  import { STEPS } from '../config/steps'
  import { flow, goToStep } from '../core/store.svelte'
</script>

<ol class="stepper">
  {#each STEPS as s, i (s.id)}
    <li>
      <button
        class:current={i === flow.current}
        class:done={i < flow.reached}
        disabled={i > flow.reached}
        onclick={() => goToStep(i)}
      >
        <span class="num">{i < flow.reached && i !== flow.current ? '✓' : i + 1}</span>
        {s.label}
      </button>
    </li>
  {/each}
</ol>

<style>
  .stepper {
    display: flex;
    gap: 4px;
    list-style: none;
    margin: 0;
    padding: 0;
    flex-wrap: wrap;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: none;
    padding: 6px 12px;
    border-radius: 999px;
    color: var(--muted);
  }
  button:disabled {
    opacity: 0.45;
  }
  button.current {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  .num {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid currentColor;
    font-size: 11px;
  }
  button.current .num {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
