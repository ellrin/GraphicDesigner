<script lang="ts">
  // 文字內容：逐條填寫標題、子標題、內文…，下方直接給出排版提案，點一下套用，之後可自由微調。
  import Section from '../../ui/Section.svelte'
  import ContentList from '../../ui/ContentList.svelte'
  import ProposalPicker from '../../ui/ProposalPicker.svelte'
  import { proposeLayouts, type SlotSource } from '../../core/autolayout'
  import { projectLayoutInput } from '../../core/layoutInput'
  import type { Pt } from '../../core/geometry'
  import { applyProposal, contentItems, contentUntouched, isContent, project, ui } from '../../core/store.svelte'
  import { untrack } from 'svelte'

  interface Props {
    /** 構圖與引導切出的區域（畫布座標） */
    regions: SlotSource[]
    /** 視覺動線上的點（依順序） */
    path: Pt[]
  }
  let { regions, path }: Props = $props()

  const count = $derived(project.objects.items.filter(isContent).length)
  const proposals = $derived(proposeLayouts(projectLayoutInput(regions, path)))

  // 文字還沒手動調整過時，加入或修改內容後自動沿用上次選的提案重新排版
  const key = $derived(JSON.stringify(contentItems()) + '|' + proposals.map((p) => p.id).join())
  // 有文字從來沒排過版（例如精靈中途關閉）：進來時先排一次
  let lastKey = untrack(() => (project.objects.items.some((o) => isContent(o) && o.props.autoRect === undefined) ? '' : key))
  let timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const k = key
    if (k === lastKey) return
    lastKey = k
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!contentUntouched()) return
      const p = proposals.find((x) => x.id === ui.layoutPref) ?? proposals[0]
      if (p) applyProposal(p)
    }, 350)
    return () => clearTimeout(timer)
  })
</script>

<Section id="objects-content" title="文字內容（{count}）" help="先填好要放的文字，下方會依構圖與空間給出排版提案；點一下套用，之後可以直接在畫布上微調。">
  <ContentList editable />
  <ProposalPicker {proposals} />
</Section>
