<script lang="ts">
  import { STEPS } from '../config/steps'
  import { flow, goToStep } from '../core/store.svelte'
</script>

<ol class="stepper">
  {#each STEPS as s, i (s.id)}
    <li>
      <button
        class:current={i === flow.current}
        class:done={i < flow.reached && i !== flow.current}
        disabled={i > flow.reached}
        onclick={() => goToStep(i)}
      >
        <span class="num">{String(i + 1).padStart(2, '0')}</span>
        <span class="label">{s.label}</span>
      </button>
    </li>
  {/each}
</ol>

<style>
  .stepper {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    align-self: stretch;
  }
  li {
    display: flex;
  }
  button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    border-radius: 0;
    background: none;
    padding: 0 16px;
    color: var(--faint);
    font-size: 14px;
  }
  button:hover:not(:disabled) {
    background: none;
    color: var(--text);
  }
  button::after {
    content: '';
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: -1px;
    height: 2px;
    background: transparent;
  }
  .num {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
  }
  button.done {
    color: var(--muted);
  }
  button.done .num::after {
    content: ' ✓';
  }
  button.current {
    color: var(--text);
    font-weight: 700;
  }
  button.current .num {
    color: var(--highlight);
  }
  button.current::after {
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }
  button:disabled {
    opacity: 1;
    color: var(--faint);
  }
  @media (max-width: 1100px) {
    .label {
      display: none;
    }
    button.current .label {
      display: inline;
    }
  }
</style>
