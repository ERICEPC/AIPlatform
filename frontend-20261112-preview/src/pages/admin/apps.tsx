import type { AppIntegration, Capability } from '@/api/admin'
import { RiGitBranchLine, RiKey2Line, RiSave3Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import type { Consumer } from '@/api/mcp-hub'
import { CAPABILITY, listApps, rotateAppSecret, updateApp } from '@/api/admin'
import { listMcpServers, RISK } from '@/api/mcp-hub'
import { ConsolePage, KV, PageHeader, Section, StatusTag } from '@/components/console'
import { Button } from '@/components/ui/button'
import { CopyField, ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, NumberInput } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/*
  应用接入（xBuddy）：X 平台最重要的使用方式是被业务应用调用。
  SalesBuddy 主要用智能体与知识库；ProjectBuddy 用整个技术栈给用户做开发。
  这里登记应用、开放能力、配置回调与限流、统一身份登录，并轮换密钥。
*/
const ALL: Capability[] = ['agents', 'kb', 'memory', 'workflows', 'skills', 'mcp', 'models', 'database', 'accelerator', 'scaffold', 'monitor']
export function AppsPage({ canEdit, id, go }: { canEdit: boolean, id?: string, go: (p: string) => void }) {
  const toast = useToast()
  const q = useQuery(listApps, [])
  const [cur, setCur] = useState<string>(id || 'salesbuddy')
  useEffect(() => { if (id) setCur(id) }, [id])
  const app = q.data?.data.find(a => a.id === cur)
  const [form, setForm] = useState<AppIntegration | null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [secret, setSecret] = useState('')
  const mcp = useQuery(listMcpServers, [])
  useEffect(() => {setForm(app ? {...app,capabilities:[...app.capabilities]} : null);setError('')}, [app])
  const dirty=!!form&&JSON.stringify(form)!==JSON.stringify(app)
  const save=async()=>{
    if(!form||busy)return
    if(form.callback_url){try{const url=new URL(form.callback_url);if(!['https:','http:'].includes(url.protocol))throw Error()}catch{setError('请填写有效的 HTTP / HTTPS 回调地址');return}}
    if(!Number.isInteger(form.rate_limit)||form.rate_limit<10||form.rate_limit>10000){setError('限流应为 10–10000 的整数');return}
    setBusy(true);setError('')
    try{await updateApp(form.id,{callback_url:form.callback_url,rate_limit:form.rate_limit,sso:form.sso,capabilities:form.capabilities});toast('应用配置已保存');q.reload()}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return (
    <ConsolePage header={<PageHeader title="应用接入（xBuddy）" desc="业务应用通过统一身份与应用凭据调用 X 平台。开放哪些能力决定应用能调用什么；每次调用仍按最终用户的权限校验。" />}>
      <div className="w-full space-y-5">
        {error&&<p role="alert" className="rounded-lg border border-rose/20 bg-rose/5 p-3 text-sm text-rose">{error}</p>}{dirty&&<div className="flex items-center justify-between rounded-lg border border-line bg-solid p-3 text-xs"><span>配置尚未保存</span><Button size="small" onClick={()=>setForm(app?{...app,capabilities:[...app.capabilities]}:null)}>放弃修改</Button></div>}
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
          {(q.data?.data ?? []).map(a => (
            <button key={a.id} type="button" onClick={() => {if(!dirty||window.confirm("有未保存的配置，是否放弃并切换应用？")){setCur(a.id);go(`admin/apps/${a.id}`)}}} className={cn('cursor-pointer rounded-xl border bg-solid p-4 text-left transition-colors', a.id === cur ? 'border-volt shadow-glow-volt' : 'border-line hover:border-line-strong')}>
              <p className="flex items-center justify-between text-[14px] font-semibold"><span className="flex items-center gap-2"><RiGitBranchLine className="size-4 text-volt-text" />{a.name}</span><StatusTag status={a.status} label={a.status === 'pending' ? '待接入' : undefined} /></p>
              <p className="mt-1 text-[12px] text-ink-3">{a.en || '—'} · 近 7 天 {a.calls_7d.toLocaleString()} 次</p>
              <div className="mt-2 flex flex-wrap gap-1">{a.capabilities.slice(0, 4).map(c => <Badge key={c}>{CAPABILITY[c]}</Badge>)}{a.capabilities.length > 4 && <Badge>+{a.capabilities.length - 4}</Badge>}</div>
            </button>
          ))}
        </div>
        {form && (
          <>
            <Section title={form.name} desc={form.desc} actions={canEdit && <><Button disabled={busy||dirty} title={dirty ? '请先保存配置' : '轮换应用密钥'} onClick={async () => { if(!window.confirm("确认轮换此应用的密钥？旧密钥将在过渡期后失效。"))return;setBusy(true);try{const r=await rotateAppSecret(form.id);setSecret(r.secret);q.reload()}catch(e){setError((e as Error).message)}finally{setBusy(false)} }}><RiKey2Line className="size-4" />轮换密钥</Button><Button variant="primary" disabled={busy||!dirty} onClick={save}><RiSave3Line className="size-4" />保存</Button></>}>
              <KV cols={3} items={[['归属业务', form.owner], ['最近调用', form.last_call ? new Date(form.last_call).toLocaleString('zh-CN') : '—'], ['典型用法', form.usage_note]]} />
              <div className="mt-5 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                <Field label="Client ID"><CopyField value={form.client_id} mono /></Field>
                <Field label="应用密钥" hint="只在轮换时显示一次，请保存到应用的部署环境。"><Input value={form.secret_hint} disabled className="font-mono" /></Field>
                <Field label="回调地址"><Input value={form.callback_url} disabled={!canEdit} onChange={e => setForm({ ...form, callback_url: e.target.value })} className="font-mono text-[13px]" /></Field>
                <Field label="限流（次 / 分钟）"><NumberInput value={form.rate_limit} min={10} max={10000} onChange={v => canEdit && setForm({ ...form, rate_limit: v })} /></Field>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-line px-4 py-3"><div><p className="text-[13.5px]">统一身份登录</p><p className="text-[12px] text-ink-3">开启后，应用里的账号可以直接登录 X 平台用户端，权限与应用中一致。</p></div><Switch aria-label="统一身份登录" checked={form.sso} disabled={!canEdit} onCheckedChange={v => setForm({ ...form, sso: v })} /></div>
            </Section>
            <Section title="开放的平台能力" desc="SalesBuddy 这类业务应用通常只需要智能体、知识库与记忆；ProjectBuddy 用整个技术栈来做开发。">
              <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2">
                {ALL.map(c => {
                  const on = form.capabilities.includes(c)
                  return (
                    <label key={c} className={cn('flex items-center justify-between rounded-lg border px-3 py-2.5 text-[13px]', on ? 'border-volt/50 bg-volt-soft' : 'border-line', canEdit && 'cursor-pointer')}>
                      {CAPABILITY[c]}
                      <Switch aria-label={CAPABILITY[c]} checked={on} disabled={!canEdit} onCheckedChange={v => setForm({ ...form, capabilities: v ? [...form.capabilities, c] : form.capabilities.filter(x => x !== c) })} />
                    </label>
                  )
                })}
              </div>
              {!canEdit && <p className="mt-3 text-[12.5px] text-ink-3">只有超级管理员可以修改应用接入；普通管理员可在业务空间里选择允许调用的 xBuddy。</p>}
            </Section>
            <Section title="MCP 端点与工具（一切皆 MCP）" desc="开放的能力对应平台 MCP 服务；应用用应用令牌 ＋ 最终用户令牌连接，需要人工授权的操作在对应任务对话中确认。" bodyClass="p-0">
              <table className="w-full text-[13px]">
                <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">MCP 服务</th><th className="px-3 font-medium">端点</th><th className="px-3 font-medium">工具</th></tr></thead>
                <tbody>{(mcp.data?.data ?? []).filter(s => s.consumers.includes(form.id as Consumer)).map(s => (
                  <tr key={s.id} className="border-t border-line align-top"><td className="px-5 py-2.5 font-medium">{s.name}<p className="font-mono text-[12px] font-normal text-ink-3">{s.id}</p></td><td className="px-3 py-2.5 font-mono text-[12px] text-ink-2">{s.endpoint}</td><td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{s.tools.map(t => <Badge key={t.name} tone={RISK[t.risk][1]}>{t.name}</Badge>)}</div></td></tr>
                ))}</tbody>
              </table>
            </Section>
          </>
        )}
      </div>
      <Dialog open={!!secret} onOpenChange={o => !o && setSecret('')} title="新的应用密钥" description="只显示这一次。旧密钥在 24 小时后失效。" footer={<Button variant="primary" onClick={() => setSecret('')}>我已保存</Button>}>
        <CopyField value={secret} mono />
      </Dialog>
    </ConsolePage>
  )
}
