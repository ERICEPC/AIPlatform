import type { DataResource } from '@/api/stack'
import { RiAddLine, RiDatabase2Line, RiFolder3Line, RiHardDrive2Line, RiStackLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { createDataResource, listDataResources } from '@/api/stack'
import { ConsolePage, KV, PageHeader, Section, StatusTag } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge, Progress } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { StatusStrip } from './status-strip'

const KIND = { schema: ['数据库 schema', RiDatabase2Line], vector: ['向量集合', RiStackLine], bucket: ['对象存储目录', RiFolder3Line], cache: ['缓存', RiHardDrive2Line] } as const

/* 数据库与存储：业务空间分配给我的 schema、向量集合、存储目录；我能在配额内新建，不能改组件连接 */
export function DataPage({ go }: { go: (p: string) => void }) {
  const toast = useToast()
  const q = useQuery(listDataResources, [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ kind: 'schema' as DataResource['kind'], name: '', space: '销售管理', purpose: '' })
  const [err, setErr] = useState('')
  return (
    <ConsolePage header={<PageHeader title="数据库与存储" desc="使用业务空间分配给你的数据资源：应用与工作流的业务表、知识库向量索引、交付物目录。组件连接与配额由管理员配置。" actions={<Button variant="primary" onClick={() => setOpen(true)}><RiAddLine className="size-4" />在配额内新建</Button>} />}>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <StatusStrip ids={['postgres', 'vector', 'object', 'redis']} go={go} />
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
          {(q.data?.data ?? []).map(r => {
            const [label, Icon] = KIND[r.kind]
            return (
              <Section key={r.id} title={<span className="flex items-center gap-2"><Icon className="size-4 text-volt-text" /><span className="font-mono">{r.name}</span></span>} desc={r.purpose} actions={<><Badge>{label}</Badge><StatusTag status={r.status} /></>}>
                <KV cols={3} items={[['业务空间', r.space], ['负责人', r.owner], ['用量', `${r.usage} / ${r.quota} ${r.unit}`]]} />
                <div className="mt-3"><Progress value={Math.min(100, (r.usage / r.quota) * 100)} /></div>
                {!!r.objects.length && <div className="mt-4 divide-y divide-line rounded-lg border border-line">{r.objects.map(o => <div key={o.name} className="flex justify-between px-3 py-2 text-[12.5px]"><span className="font-mono">{o.name}</span><span className="text-ink-3">{o.detail}</span></div>)}</div>}
                <div className="mt-4 space-y-1.5 rounded-lg bg-surface p-3 text-[12.5px]">{r.access.map(a => <p key={a.label}><span className="text-ink-3">{a.label}：</span>{a.value}</p>)}</div>
              </Section>
            )
          })}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="在配额内新建" description="只能在你有权限的业务空间里新建；超出配额需要业务管理员调整。" footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" onClick={async () => { try { await createDataResource(form); setOpen(false); setErr(''); toast('已创建'); q.reload() } catch (e) { setErr((e as Error).message) } }}>创建</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="类型"><Select value={form.kind} onValueChange={v => setForm({ ...form, kind: v })} options={[{ value: 'schema', label: '数据库 schema' }, { value: 'vector', label: '向量集合' }, { value: 'bucket', label: '对象存储目录' }]} /></Field>
            <Field label="业务空间"><Select value={form.space} onValueChange={v => setForm({ ...form, space: v })} options={['销售管理', 'FDE 交付'].map(s => ({ value: s, label: s }))} /></Field>
          </div>
          <Field label="名称" error={err || undefined} hint="小写字母、数字、下划线。"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="sales_coach" className="font-mono" /></Field>
          <Field label="用途"><Input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="例如：带教计划与复盘记录" /></Field>
        </div>
      </Dialog>
    </ConsolePage>
  )
}
