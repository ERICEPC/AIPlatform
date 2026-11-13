import type { ModelDefaults } from '@/api/stack'
import { RiSave3Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getModels, saveModelDefaults } from '@/api/stack'
import { ConsolePage, PageHeader, Section, SettingRow } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Select } from '@/components/ui/form'
import { Badge, Progress, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'

const KIND = { chat: '对话', light: '轻量', reasoning: '推理', embedding: '向量化', rerank: '重排序' } as const

/* 模型与额度：可用模型、我能用的额度和用量、我的默认模型；模型接入在管理后台「模型网关」 */
export function ModelsPage() {
  const toast = useToast()
  const q = useQuery(getModels, [])
  const [d, setD] = useState<ModelDefaults | null>(null)
  useEffect(() => { if (q.data) setD(q.data.defaults) }, [q.data])
  const chat = (q.data?.models ?? []).filter(m => ['chat', 'light', 'reasoning'].includes(m.kind)).map(m => ({ value: m.id, label: m.name }))
  return (
    <ConsolePage header={<PageHeader title="模型与额度" desc="模型统一经 MaaS 平台接入，消耗计到人和任务。这里查看可用模型与额度，设置你的默认模型。" />}>
      <div className="mx-auto max-w-[1180px] space-y-5">
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        {!q.data || !d ? <Skeleton className="h-64" /> : (
          <>
            <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
              {q.data.quotas.map(x => (
                <Section key={x.space} title={`${x.space} · 本月额度`} desc={`${x.used} / ${x.monthly} ${x.unit}`}>
                  <Progress value={(x.used / x.monthly) * 100} />
                  <div className="mt-4 space-y-2">{x.by_object.map(o => <div key={o.name} className="flex items-center gap-3 text-[13px]"><span className="w-36 truncate">{o.name}</span><div className="h-1.5 flex-1 overflow-hidden rounded bg-press"><div className="h-full bg-volt/70" style={{ width: `${(o.used / x.used) * 100}%` }} /></div><span className="w-20 text-right text-ink-3 tabular-nums">{o.used}</span></div>)}</div>
                </Section>
              ))}
            </div>
            <Section title="我的默认模型" desc="用于个人助手和你新建的智能体；智能体里单独选的模型优先。" actions={<Button variant="primary" onClick={async () => { await saveModelDefaults(d); toast('默认模型已保存') }}><RiSave3Line className="size-4" />保存</Button>}>
              <SettingRow title="对话与智能体"><Select size="sm" className="w-64" value={d.chat} onValueChange={v => setD({ ...d, chat: v })} options={chat} /></SettingRow>
              <SettingRow title="轻量任务" hint="分类、抽取、改写。"><Select size="sm" className="w-64" value={d.light} onValueChange={v => setD({ ...d, light: v })} options={chat} /></SettingRow>
              <SettingRow title="复杂推理"><Select size="sm" className="w-64" value={d.reasoning} onValueChange={v => setD({ ...d, reasoning: v })} options={chat} /></SettingRow>
              <SettingRow title="按任务自动选择" hint="个人 Router 按任务难度在以上模型间选择。"><Switch aria-label="按任务自动选择" checked={d.by_task} onCheckedChange={v => setD({ ...d, by_task: v })} /></SettingRow>
            </Section>
            <Section title="可用模型" bodyClass="p-0">
              <table className="w-full text-[13px]"><thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">模型</th><th className="px-3 font-medium">类型</th><th className="px-3 font-medium">提供方</th><th className="px-3 font-medium">说明</th><th className="px-3 font-medium">状态</th></tr></thead>
                <tbody>{q.data.models.map(m => <tr key={m.id} className="border-t border-line"><td className="px-5 py-2.5 font-medium">{m.name}</td><td className="px-3"><Badge>{KIND[m.kind]}</Badge></td><td className="px-3 text-ink-2">{m.provider}</td><td className="px-3 text-ink-3">{m.note || '—'}</td><td className="px-3"><Badge tone={m.available ? 'mint' : 'neutral'}>{m.available ? '可用' : '不可用'}</Badge></td></tr>)}</tbody>
              </table>
            </Section>
          </>
        )}
      </div>
    </ConsolePage>
  )
}
