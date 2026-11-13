import type { Member } from '@/api/admin'
import { RiAddLine, RiBuilding2Line, RiRefreshLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { createGroup, getDirectorySync, getOrg, listGroups, runDirectorySync } from '@/api/admin'
import { ROLE_LABEL } from '@/api/access'
import { ConsolePage, KV, PageHeader, Section, StatusTag } from '@/components/console'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ErrorBar } from '@/components/ui/data'
import { Input } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/* 组织与成员（参考飞书管理后台）：成员与部门 · 用户组 · 通讯录同步；普通管理员只看管理范围内 */
export function OrgPage() {
  const [tab, setTab] = useState<'members' | 'groups' | 'sync'>('members')
  return (
    <ConsolePage header={<PageHeader title="组织与成员" desc="成员与部门从飞书或统一身份同步；用户组用于可用范围、审批人与审查人。业务用户在 xBuddy 里使用，开发者可登录 X 平台。" tabs={[{ id: 'members', label: '成员与部门' }, { id: 'groups', label: '用户组' }, { id: 'sync', label: '通讯录同步' }]} tab={tab} onTab={setTab} />}>
      {tab === 'members' && <Members />}
      {tab === 'groups' && <Groups />}
      {tab === 'sync' && <Sync />}
    </ConsolePage>
  )
}

function Members() {
  const q = useQuery(getOrg, [])
  const [dept, setDept] = useState('')
  const [kw, setKw] = useState('')
  const deps = q.data?.departments ?? []
  const list = (q.data?.members ?? []).filter(m => (!dept || m.dept === dept) && (!kw || `${m.name}${m.email}${m.title}`.includes(kw)))
  const roleText = (r: Member['role']) => (r === 'user' ? '业务用户' : ROLE_LABEL[r])
  return (
      <div className="grid w-full grid-cols-[260px_1fr] gap-5 max-lg:grid-cols-1">
        <Section title="部门" bodyClass="p-2">
          {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
          <button type="button" onClick={() => setDept('')} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-[13.5px]', !dept ? 'bg-volt-soft font-medium text-volt-text' : 'hover:bg-hover')}>全部</button>
          {deps.map(d => (
            <button key={d.id} type="button" onClick={() => setDept(d.name)} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md py-2 pr-3 text-left text-[13.5px]', d.parent ? 'pl-7' : 'pl-3', dept === d.name ? 'bg-volt-soft font-medium text-volt-text' : 'hover:bg-hover')}>
              <RiBuilding2Line className="size-4 text-ink-3" /><span className="flex-1 truncate">{d.name}</span><span className="text-[12px] text-ink-3">{d.members}</span>
            </button>
          ))}
        </Section>
        <Section title={dept || '全部成员'} actions={<Input className="h-8 w-56" placeholder="搜索姓名、邮箱、岗位" value={kw} onChange={e => setKw(e.target.value)} />} bodyClass="p-0">
          <table className="w-full text-[13px]">
            <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">成员</th><th className="px-3 font-medium">部门 / 岗位</th><th className="px-3 font-medium">角色</th><th className="px-3 font-medium">常用 xBuddy</th><th className="px-3 font-medium">最近登录</th></tr></thead>
            <tbody>
              {list.map(m => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-5 py-2.5"><p className="font-medium">{m.name}</p><p className="text-[12px] text-ink-3">{m.email}</p></td>
                  <td className="px-3 text-ink-2">{m.dept}<p className="text-[12px] text-ink-3">{m.title}</p></td>
                  <td className="px-3"><Badge tone={m.role === 'super_admin' || m.role === 'admin' ? 'volt' : 'neutral'}>{roleText(m.role)}</Badge></td>
                  <td className="px-3 text-ink-2">{m.apps.join('、')}</td>
                  <td className="px-3 text-ink-3">{new Date(m.last_login).toLocaleDateString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
  )
}


function Groups() {
  const toast = useToast()
  const q = useQuery(listGroups, [])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'static' | 'dynamic'>('static')
  const [rule, setRule] = useState('')
  return (
    <div className="w-full">
      <Section title="用户组" desc="静态用户组手动维护；动态用户组按部门、岗位等规则自动更新。" actions={<Button variant="primary" onClick={() => setOpen(true)}><RiAddLine className="size-4" />新建用户组</Button>} bodyClass="p-0">
        <table className="w-full text-[13px]">
          <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">用户组</th><th className="px-3 font-medium">类型与规则</th><th className="px-3 font-medium">成员</th><th className="px-3 font-medium">用在哪里</th><th className="px-3 font-medium">负责人</th></tr></thead>
          <tbody>{(q.data?.data ?? []).map(g => <tr key={g.id} className="border-t border-line align-top"><td className="px-5 py-2.5 font-medium">{g.name}</td><td className="px-3 py-2.5"><Badge tone={g.type === 'dynamic' ? 'volt' : 'neutral'}>{g.type === 'dynamic' ? '动态' : '静态'}</Badge><p className="mt-1 text-[12px] text-ink-3">{g.rule}</p></td><td className="px-3 py-2.5 tabular-nums">{g.members}</td><td className="px-3 py-2.5 text-[12.5px] text-ink-2">{g.used_by.join('；') || '—'}</td><td className="px-3 py-2.5 text-ink-2">{g.owner}</td></tr>)}</tbody>
        </table>
      </Section>
      <Dialog open={open} onOpenChange={setOpen} title="新建用户组" footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" disabled={!name.trim()} onClick={async () => { await createGroup({ name, type, rule }); setOpen(false); setName(''); setRule(''); toast('已新建'); q.reload() }}>新建</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><Field label="名称"><Input value={name} onChange={e => setName(e.target.value)} placeholder="例如：客服一线" /></Field><Field label="类型"><Select value={type} onValueChange={setType} options={[{ value: 'static', label: '静态（手动维护）' }, { value: 'dynamic', label: '动态（按规则）' }]} /></Field></div>
          {type === 'dynamic' && <Field label="规则" hint="按部门、岗位或加入的工作流自动计算成员。"><Input value={rule} onChange={e => setRule(e.target.value)} placeholder="部门属于「客服中心」且岗位包含「坐席」" /></Field>}
        </div>
      </Dialog>
    </div>
  )
}

function Sync() {
  const toast = useToast()
  const q = useQuery(getDirectorySync, [])
  const d = q.data
  if (!d)
    return null
  return (
    <div className="w-full space-y-5">
      <Section title="通讯录同步" desc="成员、部门与上下级从企业通讯录同步；停用的成员立即失去登录与调用权限。" actions={<><StatusTag status={d.status} /><Button onClick={async () => { await runDirectorySync(); toast('已同步'); q.reload() }}><RiRefreshLine className="size-4" />立即同步</Button></>}>
        <KV cols={4} items={[['同步来源', d.source === 'feishu' ? '飞书通讯录' : d.source === 'oidc' ? '统一身份（OIDC）' : '手动维护'], ['同步频率', d.schedule], ['上次同步', new Date(d.last_sync).toLocaleString('zh-CN')], ['部门 / 成员', `${d.departments} / ${d.members}`]]} />
      </Section>
      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <Section title="字段映射" bodyClass="p-0"><table className="w-full text-[13px]"><tbody>{d.mapping.map(m => <tr key={m.field} className="border-t border-line first:border-t-0"><td className="px-5 py-2.5">{m.field}</td><td className="px-3 py-2.5 font-mono text-[12.5px] text-ink-2">{m.from}</td></tr>)}</tbody></table></Section>
        <Section title="同步记录" bodyClass="p-0">{d.log.map(l => <div key={l.time} className="flex gap-4 border-t border-line px-5 py-2.5 text-[13px] first:border-t-0"><span className="w-40 shrink-0 text-ink-3">{new Date(l.time).toLocaleString('zh-CN')}</span><span>{l.text}</span></div>)}</Section>
      </div>
    </div>
  )
}
