import { useEffect, useState } from 'react'
import type { AgentAppPartial, AgentSoul } from '@/api/agents'
import { loadPersonal, personalResources } from '@/api/personal'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InfoDialog } from './dialogs'
import { errText, RACCOON_ICONS } from './shared'

export function FromPersonalDialog({ open, onOpenChange, go }: { open: boolean, onOpenChange: (open: boolean) => void, go: (path: string) => void }) {
  const [source, setSource] = useState<{ agent: AgentAppPartial, soul: AgentSoul }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSource(undefined)
    setError('')
    Promise.all([loadPersonal(), personalResources()]).then(([{ config: c }, resources]) => {
      if (cancelled) return
      const skills = resources.skills.filter(r => c.skills.includes(r.id) && r.available)
      const knowledge = resources.kb.filter(r => c.kb.includes(r.id) && r.available)
      setSource({
        agent: { id: '', name: `${c.name || '个人助手'} · 智能体`, role: c.role, description: '基于我的个人助手配置创建', mode: 'agent', icon_type: 'link', icon: RACCOON_ICONS[5], icon_url: RACCOON_ICONS[5] },
        soul: {
          prompt: { system_prompt: [c.role, c.instructions].filter(Boolean).join('\n\n') },
          model: c.model ? { model: c.model, model_provider: c.provider, model_settings: { max_tokens: c.maxTokens } } : null,
          config_skills: skills.map(r => ({ skill_id: r.id, name: r.name, description: r.hint })),
          knowledge: { sets: knowledge.map(r => ({ id: r.id, name: r.name, datasets: [{ id: r.id, name: r.name }], query: { mode: 'generated_query' }, retrieval: { mode: 'multiple', top_k: 5 } })) },
        },
      })
    }).catch(e => { if (!cancelled) setError(errText(e)) })
    return () => { cancelled = true }
  }, [open, retry])

  if (!open) return null
  if (!source) return <Dialog open={open} onOpenChange={onOpenChange} title="从个人助手创建" footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>{error && <Button onClick={() => setRetry(r => r + 1)}>重试</Button>}</>}><p className={error ? 'text-rose' : 'text-ink-2'}>{error || '正在读取你的个人助手配置…'}</p></Dialog>
  return <InfoDialog open={open} onOpenChange={onOpenChange} mode="create" agent={source.agent} initialSoul={source.soul} onDone={a => go(`agents/${a.id}/configure`)} />
}
