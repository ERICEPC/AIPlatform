import type { AdminScope, ScopeType } from '@/api/access'
import type { AdminRole } from '@/api/admin'
import { RiAddLine, RiLock2Line, RiSave3Line, RiShieldStarLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { SCOPE_LABEL } from '@/api/access'
import { useQuery } from '@/api/hooks'
import { createRole, getOrg, grantAdmin, listAdmins, listRoles, revokeAdmin, saveRole } from '@/api/admin'
import { ConsolePage, PageHeader, Section } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/*
  管理员与权限（参考飞书管理后台的「管理员权限」）：
  管理员 ＝ 成员 ＋ 管理员角色 ＋ 管理范围。角色是一组权限项；范围是部门、业务或工作流。
  预置角色：超级管理员（全部权限，不可修改）· 业务管理员 · 审批管理员 · 安全审计员；可新建自定义角色。
*/
type Tab = 'admins' | 'roles' | 'matrix'
const SCOPE_TEXT: Record<AdminRole['scope_types'][number], string> = { all: '全部', department: '部门', business: '业务', workflow: '工作流' }

export function AdminsPage({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('admins')
  const q = useQuery(listAdmins, [])
  const r = useQuery(listRoles, [])
  const org = useQuery(getOrg, [], { enabled: canEdit })
  const [open, setOpen] = useState(false)
  const [member, setMember] = useState('')
  const [roleId, setRoleId] = useState('role-biz')
  const [scopes, setScopes] = useState<AdminScope[]>([])
  const [type, setType] = useState<ScopeType>('business')
  const [name, setName] = useState('')
  const roleName = (id: string) => r.data?.data.find(x => x.id === id)?.name ?? id
  return (
    <ConsolePage header={<PageHeader title="管理员与权限" desc="管理员 ＝ 成员 ＋ 管理员角色 ＋ 管理范围。超级管理员拥有全部权限；其他管理员按角色的权限项，在部门、业务或工作流范围内管理。" actions={canEdit && tab === 'admins' && <Button variant="primary" onClick={() => setOpen(true)}><RiAddLine className="size-4" />添加管理员</Button>} tabs={[{ id: 'admins', label: '管理员', count: q.data?.data.length }, { id: 'roles', label: '管理员角色', count: r.data?.data.length }, { id: 'matrix', label: '权限矩阵' }]} tab={tab} onTab={setTab} />}>
      <div className="w-full space-y-5">
        {(q.error || r.error) && <ErrorBar error={q.error || r.error} onRetry={() => { q.reload(); r.reload() }} />}
        {tab === 'admins' && (
          <Section title="管理员" bodyClass="p-0">
            <table className="w-full text-[13px]">
              <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">管理员</th><th className="px-3 font-medium">角色</th><th className="px-3 font-medium">管理范围</th><th className="px-3 font-medium">任命</th><th /></tr></thead>
              <tbody>
                {(q.data?.data ?? []).map(a => (
                  <tr key={a.id} className="border-t border-line align-top">
                    <td className="px-5 py-3"><p className="flex items-center gap-1.5 font-medium"><RiShieldStarLine className="size-4 text-volt-text" />{a.name}</p><p className="text-[12px] text-ink-3">{a.email}</p></td>
                    <td className="px-3 py-3"><Badge tone="volt">{roleName(a.role_id)}</Badge></td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{a.role === 'super_admin' ? <span className="text-ink-2">全部</span> : a.scopes.map(s => <Badge key={s.id}>{SCOPE_LABEL[s.type]} · {s.name}</Badge>)}</div></td>
                    <td className="px-3 py-3 text-[12.5px] text-ink-3">{a.granted_by} · {new Date(a.granted_at).toLocaleDateString('zh-CN')}</td>
                    <td className="px-3 py-2.5 text-right">{canEdit && a.role === 'admin' && <Button size="small" variant="ghost" tone="destructive" onClick={async () => { await revokeAdmin(a.id); toast('已撤销', 'info'); q.reload() }}>撤销</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
        {tab === 'roles' && r.data && <Roles roles={r.data.data} items={r.data.items} canEdit={canEdit} onSaved={r.reload} />}
        {tab === 'matrix' && (
          <Section title="权限矩阵" desc="前端按角色显示功能；服务端在每次调用时重新校验权限。" bodyClass="p-0">
            <table className="w-full text-[13px]">
              <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="w-[180px] px-5 py-2 font-medium">对象</th><th className="px-3 font-medium">开发者</th><th className="px-3 font-medium">普通管理员</th><th className="px-3 font-medium">超级管理员</th></tr></thead>
              <tbody>{(q.data?.matrix ?? []).map(m => <tr key={m.object} className="border-t border-line align-top"><td className="px-5 py-2.5 font-medium">{m.object}</td><td className="px-3 py-2.5 text-ink-2">{m.actions.developer}</td><td className="px-3 py-2.5 text-ink-2">{m.actions.admin}</td><td className="px-3 py-2.5 text-ink-2">{m.actions.super_admin}</td></tr>)}</tbody>
            </table>
          </Section>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="添加管理员" description="选择成员、管理员角色和管理范围；可以同时管理多个部门、业务或工作流。" footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" disabled={!member || !scopes.length} onClick={async () => { await grantAdmin({ member_id: member, role_id: roleId, scopes }); setOpen(false); setScopes([]); toast('已添加管理员'); q.reload() }}>添加</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="成员"><Select value={member} onValueChange={setMember} placeholder="选择成员" options={(org.data?.members ?? []).filter(m => m.role !== 'super_admin' && m.role !== 'admin').map(m => ({ value: m.id, label: `${m.name} · ${m.dept}` }))} /></Field>
            <Field label="管理员角色"><Select value={roleId} onValueChange={setRoleId} options={(r.data?.data ?? []).filter(x => x.id !== 'role-super').map(x => ({ value: x.id, label: x.name }))} /></Field>
          </div>
          <Field label="添加管理范围">
            <div className="flex gap-2"><Select className="w-32" value={type} onValueChange={setType} options={(['business', 'department', 'workflow'] as ScopeType[]).map(t => ({ value: t, label: SCOPE_LABEL[t] }))} /><Input value={name} placeholder="例如：客服中心" onChange={e => setName(e.target.value)} /><Button onClick={() => { if (name.trim()) { setScopes(s => [...s, { type, id: `${type}-${Date.now()}`, name: name.trim() }]); setName('') } }}>添加</Button></div>
          </Field>
          <div className="flex flex-wrap gap-1.5">{scopes.map(s => <Badge key={s.id} tone="volt">{SCOPE_LABEL[s.type]} · {s.name}</Badge>)}</div>
        </div>
      </Dialog>
    </ConsolePage>
  )
}

function Roles({ roles, items, canEdit, onSaved }: { roles: AdminRole[], items: { id: string, group: string, name: string, desc: string }[], canEdit: boolean, onSaved: () => void }) {
  const toast = useToast()
  const [cur, setCur] = useState(roles[1]?.id ?? roles[0]?.id)
  const role = roles.find(x => x.id === cur) ?? roles[0]
  const [perm, setPerm] = useState<string[]>(role?.permissions ?? [])
  useEffect(() => setPerm(role?.permissions ?? []), [role])
  const locked = !canEdit || role?.id === 'role-super'
  const groups = [...new Set(items.map(i => i.group))]
  return (
    <div className="grid grid-cols-[280px_1fr] gap-5 max-lg:grid-cols-1">
      <Section title="角色" bodyClass="p-2" actions={canEdit && <Button size="small" onClick={async () => { const n = await createRole({ name: '自定义角色', desc: '按需勾选权限项。', permissions: ['audit.view'], scope_types: ['department'] }); onSaved(); setCur(n.id) }}><RiAddLine className="size-3.5" />新建</Button>}>
        {roles.map(x => (
          <button key={x.id} type="button" onClick={() => setCur(x.id)} className={cn('block w-full cursor-pointer rounded-md px-3 py-2.5 text-left', x.id === role?.id ? 'bg-volt-soft' : 'hover:bg-hover')}>
            <span className="flex items-center gap-2 text-[13.5px] font-medium">{x.name}{x.preset && <Badge>预置</Badge>}</span>
            <span className="mt-0.5 block text-[12px] text-ink-3">{x.permissions.length} 项权限 · {x.members} 人</span>
          </button>
        ))}
      </Section>
      {role && (
        <Section title={role.name} desc={role.desc} actions={locked ? <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><RiLock2Line className="size-4" />{role.id === 'role-super' ? '超级管理员不可修改' : '只读'}</span> : <Button variant="primary" onClick={async () => { await saveRole(role.id, { name: role.name, desc: role.desc, permissions: perm, scope_types: role.scope_types }); toast('角色已保存'); onSaved() }}><RiSave3Line className="size-4" />保存</Button>}>
          <p className="mb-3 text-[12.5px] text-ink-3">可用的管理范围：{role.scope_types.map(s => SCOPE_TEXT[s]).join('、')}</p>
          <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
            {groups.map(g => (
              <div key={g} className="rounded-lg border border-line p-3">
                <p className="mb-2 text-[13px] font-semibold">{g}</p>
                {items.filter(i => i.group === g).map(i => (
                  <label key={i.id} className={cn('flex items-start gap-2.5 rounded-md px-2 py-1.5', !locked && 'cursor-pointer hover:bg-hover')}>
                    <input type="checkbox" className="mt-1" disabled={locked} checked={perm.includes(i.id)} onChange={e => setPerm(p => (e.target.checked ? [...p, i.id] : p.filter(x => x !== i.id)))} />
                    <span><span className="block text-[13px]">{i.name}</span><span className="block text-[12px] text-ink-3">{i.desc}</span></span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
