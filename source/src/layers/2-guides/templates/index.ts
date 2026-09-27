import { buildRegistry, type Generator, type TemplateMeta } from '../../../core/registry'
import type { ParamSchema } from '../../../core/params'

// 自動掃描本資料夾下所有視覺引導；新增引導只要新增資料夾
export const guideTemplates = buildRegistry(
  import.meta.glob<{ default: Generator }>('./*/generate.ts', { eager: true }),
  import.meta.glob<ParamSchema>('./*/params.json', { eager: true, import: 'default' }),
  import.meta.glob<TemplateMeta>('./*/meta.json', { eager: true, import: 'default' }),
)
