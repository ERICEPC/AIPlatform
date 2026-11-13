import type { RouterRule, RouterSettings, RouteTest } from '@/api/tune'
import { RiAddLine, RiDeleteBinLine, RiPlayLine, RiSave3Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getRouter, saveRouter, TARGET_LABEL, testRoute } from '@/api/tune'
import { Section, SettingRow } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Input, NumberInput, Select } from '@/components/ui/form'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'

/* 任务路由：个人 Router 的规则、兜底策略与试运行 */
export function TuneRouter() {
  const toast = useToast()
  const q = useQuery(getRouter, [])
  const [rules, setRules] = useState<RouterRule[]>([])
  const [settings, setSettings] = useState<RouterSettings | null>(null)
  const [text, setText] = useState('把本机 ~/Work/客户A 里的拜访记录整理成周报，做成 PPT 发给客户')
  const [result, setResult] = useState<RouteTest | null>(null)
  useEffect(() => { if (q.data) { setRules(q.data.rules); setSettings(q.data.settings) } }, [q.data])
  if (q.error)
    return <ErrorBar error={q.error} onRetry={q.reload} />
  if (!settings)
    return <Skeleton className="h-64" />
  const dirty = JSON.stringify({ rules, settings }) !== JSON.stringify(q.data)
  const patch = (id: string, p: Partial<RouterRule>) => setRules(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const set = (p: Partial<RouterSettings>) => setSettings(s => (s ? { ...s, ...p } : s))
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <Section title="试一句任务" desc="不会真正执行，只展示个人 Router 会怎么拆、交给谁、在哪里做。">
        <div className="flex gap-2"><Input value={text} onChange={e => setText(e.target.value)} /><Button variant="primary" onClick={async () => setResult(await testRoute(text))}><RiPlayLine className="size-4" />试运行</Button></div>
        {result && (
          <div className="mt-4">
            <p className="text-[12.5px] text-ink-3">把握度 {Math.round(result.confidence * 100)}%{result.matched_rule ? ` · 命中规则 ${rules.findIndex(r => r.id === result.matched_rule) + 1}` : ''}</p>
            <ol className="mt-2 space-y-2">
              {result.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-volt text-[12px] font-semibold text-volt-ink">{i + 1}</span>
                  <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">{s.target.name}<Badge tone="volt">{TARGET_LABEL[s.target.type]}</Badge><Badge>{s.where === 'desktop' ? '桌面端' : s.where === 'cloud' ? '云端' : '人'}</Badge></span><span className="mt-0.5 block text-[12.5px] text-ink-3">{s.reason}</span></span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Section>

      <Section
        title="路由规则"
        desc="按优先级从上到下匹配；没有命中时由助手自动判断。规则只决定交给谁，权限仍在每次调用时重新校验。"
        actions={<><Button onClick={() => setRules(rs => [...rs, { id: `r${Date.now()}`, when: '', target: { type: 'cloud', name: '' }, confirm: false, enabled: true, priority: rs.length + 1, hits_7d: 0, success_rate: 0 }])}><RiAddLine className="size-4" />添加规则</Button><Button variant="primary" disabled={!dirty} onClick={async () => { await saveRouter({ rules, settings }); q.reload(); toast('路由已保存，新对话开始生效') }}><RiSave3Line className="size-4" />保存</Button></>}
        bodyClass="p-0"
      >
        <table className="w-full text-[13px]">
          <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="w-10 px-4 py-2.5 font-medium">#</th><th className="px-3 font-medium">什么时候</th><th className="w-[150px] px-3 font-medium">交给</th><th className="px-3 font-medium">执行方</th><th className="w-[90px] px-3 font-medium">先确认</th><th className="w-[120px] px-3 font-medium">近 7 天</th><th className="w-[90px] px-3 font-medium">启用</th><th className="w-10" /></tr></thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id} className="border-t border-line align-middle">
                <td className="px-4 py-2 text-ink-3 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2"><Input value={r.when} placeholder="例如：涉及合同条款" onChange={e => patch(r.id, { when: e.target.value })} /></td>
                <td className="px-3"><Select size="sm" value={r.target.type} onValueChange={v => patch(r.id, { target: { ...r.target, type: v } })} options={Object.entries(TARGET_LABEL).map(([value, label]) => ({ value: value as RouterRule['target']['type'], label }))} /></td>
                <td className="px-3"><Input value={r.target.name} placeholder="名称" onChange={e => patch(r.id, { target: { ...r.target, name: e.target.value } })} /></td>
                <td className="px-3"><Switch aria-label="先确认" checked={r.confirm} onCheckedChange={v => patch(r.id, { confirm: v })} /></td>
                <td className="px-3 text-ink-2 tabular-nums">{r.hits_7d} 次 · {r.success_rate}%</td>
                <td className="px-3"><Switch aria-label="启用" checked={r.enabled} onCheckedChange={v => patch(r.id, { enabled: v })} /></td>
                <td className="pr-3"><Button variant="ghost" size="icon-small" aria-label="删除规则" onClick={() => setRules(rs => rs.filter(x => x.id !== r.id))}><RiDeleteBinLine className="size-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="路由策略">
        <SettingRow title="路由方式" hint="自动：助手结合规则与上下文判断；规则优先：先按规则匹配，未命中再自动判断。"><Select size="sm" className="w-44" value={settings.mode} onValueChange={v => set({ mode: v })} options={[{ value: 'auto', label: '自动判断' }, { value: 'rules_first', label: '规则优先' }]} /></SettingRow>
        <SettingRow title="把握不足时" hint="低于下方把握度阈值时的处理方式。"><Select size="sm" className="w-44" value={settings.fallback} onValueChange={v => set({ fallback: v })} options={[{ value: 'ask', label: '先向我提问' }, { value: 'cloud', label: '由助手直接处理' }]} /></SettingRow>
        <SettingRow title="把握度阈值" hint="0.5–0.95，越高越谨慎。"><NumberInput className="w-28" value={settings.confidence} min={0.5} max={0.95} step={0.05} onChange={v => set({ confidence: v })} /></SettingRow>
        <SettingRow title="本机文件优先在桌面端处理" hint="文件不上传云端，桌面连接器离线时排队等待。"><Switch aria-label="本机文件优先" checked={settings.prefer_local_files} onCheckedChange={v => set({ prefer_local_files: v })} /></SettingRow>
        <SettingRow title="同时委派的最大数量" hint="同一任务里并行交给专家智能体或工具的上限。"><NumberInput className="w-28" value={settings.max_parallel} min={1} max={6} onChange={v => set({ max_parallel: v })} /></SettingRow>
        <SettingRow title="按任务选择模型" hint="简单任务用轻量模型，复杂推理用旗舰模型；在「模型与额度」里设置可用模型。"><Switch aria-label="按任务选择模型" checked={settings.model_by_task} onCheckedChange={v => set({ model_by_task: v })} /></SettingRow>
        <SettingRow title="在对话里显示路由过程" hint="每次回复上方显示交给了谁、在哪里执行。"><Switch aria-label="显示路由过程" checked={settings.explain_route} onCheckedChange={v => set({ explain_route: v })} /></SettingRow>
      </Section>
    </div>
  )
}
