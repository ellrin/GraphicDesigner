<script lang="ts">
  // 依 ParamSchema 自動產生的參數面板，所有圖層共用。
  import type { ParamSchema, ParamValues, PointValue } from '../core/params'

  interface Props {
    schema: ParamSchema
    values: ParamValues
    onreset?: () => void
  }
  let { schema, values = $bindable(), onreset }: Props = $props()

  const entries = $derived(Object.entries(schema))
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''))
</script>

{#if entries.length > 0}
  <div class="params">
    {#each entries as [key, spec] (key)}
      <label class="row" class:inline={spec.type === 'boolean'}>
        {#if spec.type === 'boolean'}
          <input type="checkbox" bind:checked={values[key] as boolean} />
          <span>{spec.label}</span>
        {:else if spec.type === 'point'}
          {@const v = values[key] as PointValue}
          <span class="head">
            {spec.label}
            <output>({fmt(v.x)}, {fmt(v.y)})</output>
          </span>
          <span class="xy">
            {#each ['x', 'y'] as const as axis (axis)}
              <input
                type="range"
                min={spec.min ?? 0}
                max={spec.max ?? 1}
                step="0.001"
                value={v[axis]}
                aria-label="{spec.label} {axis}"
                oninput={(e) => (values[key] = { ...v, [axis]: Number(e.currentTarget.value) })}
              />
            {/each}
          </span>
        {:else if spec.type === 'select'}
          <span>{spec.label}</span>
          <select bind:value={values[key]}>
            {#each spec.options as o (o.value)}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
        {:else}
          <span class="head">
            {spec.label}
            <output>{fmt(values[key] as number)}</output>
          </span>
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.type === 'int' ? 1 : (spec.step ?? 0.01)}
            bind:value={values[key] as number}
          />
        {/if}
      </label>
    {/each}
    {#if onreset}
      <button class="link" onclick={onreset}>恢復預設值</button>
    {/if}
  </div>
{/if}

<style>
  .params {
    display: grid;
    gap: 12px;
  }
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .row.inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .head {
    display: flex;
    justify-content: space-between;
  }
  output {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  input[type='range'] {
    width: 100%;
    min-width: 0;
  }
  .xy {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
</style>
