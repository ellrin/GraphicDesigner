<script lang="ts">
  // 把裡面的 Section 設成同一組：一次只展開一個
  import type { Snippet } from 'svelte'
  import { provideAccordion } from './accordionState.svelte'

  let { name, children }: { name: string; children: Snippet } = $props()
  provideAccordion(() => name)
</script>

{@render children()}
