import type { AgentCtx } from '../detail'
import type { ConfigCtx, SectionKey } from './context'
import type { AgentSoul, ModelProviderGroup, ToolProvider } from '@/api/agents'
import { RiSettings4Line } from '@remixicon/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBuildDraft, getComposer, listModels, listToolProviders, saveComposer } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/primitives'
import { errText } from '../shared'
import { AdvancedSection } from './advanced'
import { ChatPane } from './chat'
import { Ctx, diffSections } from './context'
import { FilesSection } from './files'
import { KnowledgeSection } from './knowledge'
import { ModelSection } from './model'
import { PromptSection } from './prompt'
import { PublishBar } from './publish'
import { SkillsSection } from './skills'
import { ToolsSection } from './tools'

export type SaveState = { state: 'saved' | 'pending' | 'saving' | 'error', at?: number | null, error?: string }

export default function ConfigureSection({ ctx }: { ctx: AgentCtx }) {
  const id = ctx.agent.id
  const [soul, setSoul] = useState<AgentSoul | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [build, setBuild] = useState<AgentSoul | null>(null)
  const [models, setModels] = useState<ModelProviderGroup[]>([])
  const [tools, setTools] = useState<ToolProvider[]>([])

  const soulRef = useRef<AgentSoul | null>(null)
  const dirty = useRef(false)
  const saveError = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inflight = useRef<Promise<void> | null>(null)
  const { setPublish } = ctx

  const load = useCallback(async () => {
    try {
      const c = await getComposer(id)
      soulRef.current = c.agent_soul
      setSoul(c.agent_soul)
      setSave({ state: 'saved', at: c.draft?.updated_at })
      setPublish({ published: c.active_config_is_published, everPublished: !!c.active_config_snapshot })
      setLoadError(null)
    }
    catch (e) {
      setLoadError(errText(e))
    }
  }, [id, setPublish])

  const refreshBuild = useCallback(async () => {
    try {
      const d = await getBuildDraft(id)
      setBuild(d.draft ? d.agent_soul ?? null : null)
    }
    catch {}
  }, [id])

  useEffect(() => {
    load()
    refreshBuild()
    listModels('llm').then(r => setModels(r.data)).catch(() => {})
    Promise.all((['builtin', 'api', 'workflow', 'mcp'] as const).map(k => listToolProviders(k).catch(() => [] as ToolProvider[]))).then(r => setTools(r.flat()))
  }, [load, refreshBuild])

  const doSave = useCallback(async () => {
    if (!dirty.current || !soulRef.current)
      return
    dirty.current = false
    saveError.current = null
    setSave(s => ({ ...s, state: 'saving' }))
    const p = saveComposer(id, soulRef.current)
      .then((r) => {
        if (!dirty.current)
          setSave({ state: 'saved', at: r.draft?.updated_at })
        setPublish({ published: r.active_config_is_published, everPublished: !!r.active_config_snapshot })
      })
      .catch((e) => {
        saveError.current = errText(e)
        dirty.current = true
        setSave(s => ({ ...s, state: 'error', error: saveError.current || undefined }))
      })
    inflight.current = p
    await p
    inflight.current = null
  }, [id, setPublish])

  const update = useCallback((fn: (s: AgentSoul) => AgentSoul) => {
    const next = fn(soulRef.current!)
    soulRef.current = next
    setSoul(next)
    dirty.current = true
    setSave(s => ({ ...s, state: 'pending' }))
    clearTimeout(timer.current)
    timer.current = setTimeout(doSave, 800)
  }, [doSave])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (inflight.current)
      await inflight.current
    await doSave()
    if (saveError.current) throw new Error(`配置未保存：${saveError.current}`)
  }, [doSave])

  // 离开配置页时把没保存的改动写回去
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (dirty.current)
      doSave()
  }, [doSave])

  const changed = useMemo(() => new Set<SectionKey>(soul && build ? diffSections(soul, build) : []), [soul, build])

  const value: ConfigCtx | null = useMemo(() => soul ? { agentId: id, soul, update, flush, reload: load, changed, models, tools } : null, [id, soul, update, flush, load, changed, models, tools])

  if (loadError && !soul)
    return <EmptyState icon={<RiSettings4Line className="size-6" />} title="配置读取失败" hint={loadError} action={<Button variant="primary" onClick={load}>重试</Button>} />
  if (!value) {
    return (
      <div className="grid flex-1 grid-cols-[minmax(0,1.15fr)_minmax(380px,1fr)] gap-4 p-5">
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-[20px]" />)}</div>
        <Skeleton className="rounded-[22px]" />
      </div>
    )
  }

  return (
    <Ctx.Provider value={value}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(380px,1fr)]">
          <div className="min-h-0 overflow-auto px-5 pt-5 pb-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">能力配置</h1>
                <p className="mt-1 text-[13px] text-ink-2">改动自动保存为草稿，发布后才会对 Web 应用、API生效。</p>
              </div>
            </div>
            <div className="space-y-3">
              <ModelSection />
              <PromptSection />
              <SkillsSection />
              <FilesSection go={ctx.go} />
              <ToolsSection go={ctx.go} />
              <KnowledgeSection />
              <AdvancedSection />
            </div>
          </div>
          <div className="min-h-0 border-l border-line p-3">
            <ChatPane agent={ctx.agent} build={build} onBuildChange={refreshBuild} onApplied={load} />
          </div>
        </div>
        <PublishBar ctx={ctx} save={save} onRetrySave={flush} />
      </div>
    </Ctx.Provider>
  )
}
