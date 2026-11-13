import type { Consumer, McpTool, TryResult } from '@/api/mcp-hub'
import { RiPlayLine, RiPlugLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { CONSUMER, getMcpClientConfig, listMcpServers, RISK, tryMcpTool } from '@/api/mcp-hub'
import { ConsolePage, KV, PageHeader, Section, StatusTag } from '@/components/console'
import { Button } from '@/components/ui/button'
import { CopyField, ErrorBar } from '@/components/ui/data'
import { Select, Textarea } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/*
  平台 MCP（一切皆 MCP）：X 平台的每项能力都以 MCP 服务开放，个人助理（DeepSeek Harness）、编排引擎与各个 xBuddy 用同一套协议调用。
  这里看服务与工具、试调用（写入与对外只做预演），并生成 MCP 客户端配置。
*/
export function McpHubPage({ go }: { go: (p: string) => void }) {
  const q = useQuery(listMcpServers, [])
  const list = q.data?.data ?? []
  const [cur, setCur] = useState('rx-knowledge')
  const s = list.find(x => x.id === cur) ?? list[0]
  const [tool, setTool] = useState('')
  const [args, setArgs] = useState('{}')
  const [res, setRes] = useState<TryResult | null>(null)
  const [consumer, setConsumer] = useState<Consumer>('harness')
  const cfg = useQuery(() => getMcpClientConfig(consumer), [consumer])
  const t: McpTool | undefined = s?.tools.find(x => x.name === tool) ?? s?.tools[0]
  useEffect(() => { if (s) { setTool(s.tools[0]?.name ?? ''); setArgs(JSON.stringify(s.tools[0]?.example ?? {}, null, 2)); setRes(null) } }, [s?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    if (!s || !t)
      return
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(args || '{}') }
    catch { setRes({ ok: false, latency_ms: 0, result: { error: '参数不是合法的 JSON' }, audit_id: '' }); return }
    setRes(await tryMcpTool(s.id, t.name, parsed))
  }
  return (
    <ConsolePage
      bodyClass="p-0 flex min-h-0"
      header={<PageHeader title="平台 MCP" desc="一切皆 MCP：智能体、工作流、知识库、记忆、Skills、业务数据、模型、待我确认、桌面连接器与开发套件，都以 MCP 服务开放；个人助理与各个 xBuddy 用同一套协议调用。" meta={<Badge tone="volt">{list.length} 个服务</Badge>} actions={<Button onClick={() => go('integrations')}><RiPlugLine className="size-4" />接入外部 MCP</Button>} />}
    >
      <nav className="w-[250px] shrink-0 overflow-auto border-r border-line bg-solid p-2">
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        {list.map(x => (
          <button key={x.id} type="button" onClick={() => setCur(x.id)} className={cn('block w-full cursor-pointer rounded-md px-3 py-2 text-left', x.id === s?.id ? 'bg-volt-soft' : 'hover:bg-hover')}>
            <span className={cn('flex items-center gap-2 text-[13.5px] font-medium', x.id === s?.id && 'text-volt-text')}>{x.name}<span className="ml-auto font-mono text-[11.5px] font-normal text-ink-3">{x.id}</span></span>
            <span className="mt-0.5 block text-[12px] text-ink-3">{x.tools.length} 个工具 · 近 7 天 {x.calls_7d.toLocaleString()} 次</span>
          </button>
        ))}
      </nav>
      {s && (
        <div className="min-w-0 flex-1 space-y-4 overflow-auto p-6">
          <Section title={<span className="flex items-center gap-2">{s.name}<span className="font-mono text-[13px] font-normal text-ink-3">{s.id}</span></span>} desc={s.desc} actions={<StatusTag status={s.status} />}>
            <div className="grid grid-cols-[1fr_auto] gap-4 max-lg:grid-cols-1"><CopyField value={s.endpoint} mono /><Badge>Streamable HTTP · 经 MCP 网关</Badge></div>
            <div className="mt-4"><KV cols={2} items={[['调用方', <span className="flex flex-wrap gap-1">{s.consumers.map(c => <Badge key={c}>{CONSUMER[c]}</Badge>)}</span>], ['依赖的技术栈组件', s.backed_by.join(' · ')]]} /></div>
          </Section>
          <Section title="工具" bodyClass="p-0">
            <table className="w-full text-[13px]">
              <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">工具</th><th className="w-[80px] px-3 font-medium">风险</th><th className="px-3 font-medium">参数</th></tr></thead>
              <tbody>{s.tools.map(x => (
                <tr key={x.name} className={cn('cursor-pointer border-t border-line align-top', x.name === t?.name && 'bg-volt-soft/60')} onClick={() => { setTool(x.name); setArgs(JSON.stringify(x.example, null, 2)); setRes(null) }}>
                  <td className="px-5 py-2.5"><p className="font-medium">{x.title} <span className="font-mono text-[12px] font-normal text-ink-3">{x.name}</span></p><p className="mt-0.5 text-[12.5px] text-ink-3">{x.desc}</p></td>
                  <td className="px-3 py-2.5"><Badge tone={RISK[x.risk][1]}>{RISK[x.risk][0]}</Badge></td>
                  <td className="px-3 py-2.5 text-[12.5px] text-ink-2">{x.args.length ? x.args.map(a => <span key={a.name} className="mr-2 inline-block font-mono">{a.name}{a.required ? '*' : ''}<span className="text-ink-3">: {a.type}</span></span>) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </Section>
          <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
            <Section title="试调用" desc="以当前账号调用；写入与对外工具只做预演。" actions={<Button variant="primary" onClick={run}><RiPlayLine className="size-4" />调用</Button>}>
              <Select value={t?.name ?? ''} onValueChange={(v) => { setTool(v); setArgs(JSON.stringify(s.tools.find(x => x.name === v)?.example ?? {}, null, 2)); setRes(null) }} options={s.tools.map(x => ({ value: x.name, label: `${x.title}（${x.name}）` }))} />
              <Textarea rows={6} className="mt-3 font-mono text-[12.5px]" value={args} onChange={e => setArgs(e.target.value)} />
              {res && <pre className={cn('mt-3 max-h-60 overflow-auto rounded-lg border p-3 font-mono text-[12px] leading-relaxed', res.ok ? 'border-line bg-surface' : 'border-rose/30 bg-rose-soft text-rose')}>{JSON.stringify(res, null, 2)}</pre>}
            </Section>
            <Section title="客户端配置" desc={cfg.data?.note}>
              <Select value={consumer} onValueChange={setConsumer} options={(Object.keys(CONSUMER) as Consumer[]).map(c => ({ value: c, label: CONSUMER[c] }))} />
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-navy p-3 font-mono text-[12px] leading-relaxed text-white">{cfg.data?.json}</pre>
            </Section>
          </div>
        </div>
      )}
    </ConsolePage>
  )
}
