import type { AgentSoul, ModelProviderGroup, ToolProvider } from '@/api/agents'
import { createContext, useContext } from 'react'

/* 配置页内部共享状态：当前 agent_soul + 修改入口 + 目录数据 */
export type SectionKey = 'model' | 'prompt' | 'config_skills' | 'config_files' | 'tools' | 'knowledge' | 'env' | 'app_features'

export type ConfigCtx = {
  agentId: string
  soul: AgentSoul
  /** 本地修改并排队自动保存 */
  update: (fn: (s: AgentSoul) => AgentSoul) => void
  /** 立刻保存未落盘的修改（调用会改服务端配置的接口前先 flush） */
  flush: () => Promise<void>
  /** 重新读取服务端配置（上传 Skill / 文件等接口直接改了服务端） */
  reload: () => Promise<void>
  /** 构建草稿里有改动的分区 */
  changed: Set<SectionKey>
  models: ModelProviderGroup[]
  tools: ToolProvider[]
  readOnly?: boolean
}

export const Ctx = createContext<ConfigCtx | null>(null)
export const useConfig = () => useContext(Ctx)!

export const SECTION_LABEL: Record<SectionKey, string> = {
  model: '模型',
  prompt: '提示词',
  config_skills: 'Skills',
  config_files: '文件',
  tools: '工具',
  knowledge: '知识检索',
  env: '环境变量',
  app_features: '对话功能',
}

/** 对比两份配置，列出有差异的分区 */
export function diffSections(a: AgentSoul, b: AgentSoul): SectionKey[] {
  const pick: Record<SectionKey, (s: AgentSoul) => unknown> = {
    model: s => s.model ?? null,
    prompt: s => s.prompt?.system_prompt ?? '',
    config_skills: s => s.config_skills ?? [],
    config_files: s => s.config_files ?? [],
    tools: s => s.tools ?? {},
    knowledge: s => ({ sets: s.knowledge?.sets ?? [], external_sets: s.knowledge?.external_sets ?? [] }),
    env: s => s.env?.variables ?? [],
    app_features: s => s.app_features ?? {},
  }
  return (Object.keys(pick) as SectionKey[]).filter(k => JSON.stringify(pick[k](a)) !== JSON.stringify(pick[k](b)))
}

/* ---------- 提示词引用 token：[§kind:id:label§] ---------- */
export type RefKind = 'skill' | 'file' | 'tool' | 'cli_tool' | 'knowledge'
export type RefItem = { kind: RefKind, id: string, label: string }
export const REF_LABEL: Record<RefKind, string> = { skill: 'Skill', file: '文件', tool: '工具', cli_tool: 'CLI 工具', knowledge: '知识检索' }

export const refToken = (r: RefItem) => `[§${r.kind}:${r.id}:${r.label}§]`
export const REF_RE = /\[§([a-z_]+):([^:§\]]+)(?::([^§\]]*))?§\]/g

export function referenceables(s: AgentSoul): RefItem[] {
  return [
    ...(s.config_skills ?? []).map(x => ({ kind: 'skill' as const, id: x.name, label: x.name })),
    ...(s.config_files ?? []).map(x => ({ kind: 'file' as const, id: x.name, label: x.name })),
    ...(s.tools?.dify_tools ?? []).map(x => ({ kind: 'tool' as const, id: `${x.provider_id}/${x.tool_name}`, label: x.name || x.tool_name })),
    ...(s.tools?.cli_tools ?? []).map(x => ({ kind: 'cli_tool' as const, id: x.id || x.name, label: x.name })),
    ...[...(s.knowledge?.sets ?? []), ...(s.knowledge?.external_sets ?? [])].map(x => ({ kind: 'knowledge' as const, id: x.id, label: x.name })),
  ]
}
