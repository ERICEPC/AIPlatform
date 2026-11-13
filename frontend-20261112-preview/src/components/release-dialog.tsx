import { useEffect, useState } from 'react'
import { getAuthority, submitRelease, type Authority, type ReleaseOptions } from '@/api/governance'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Field, Select, Textarea } from './ui/form'
export const emptyRelease: ReleaseOptions = { visibility: 'private', department_ids: [], department_id: null }
export const selectClass = 'h-10 w-full rounded-lg border border-line bg-glass-2 px-3 text-[13px]'
export function ReleaseFields({ value, onChange, agent = false }: { value: ReleaseOptions; onChange: (v: ReleaseOptions) => void; agent?: boolean }) {
  const [auth, setAuth] = useState<Authority>(), [error, setError] = useState('')
  useEffect(() => { getAuthority().then(setAuth).catch(e => setError(e.message)) }, [])
  const privateMode = value.visibility === 'private'
  const eligible = auth?.departments.filter(d => auth.role === 'super_admin' || auth.department_id === d.id) || []
  return <div className="space-y-4 text-[13px] leading-5">
    {error && <p role="alert" className="text-rose">{error}</p>}
    <Field label="可见范围">
      <Select value={value.visibility} onValueChange={v => onChange({ ...value, visibility: v, department_ids: [], department_id: v === 'private' ? null : value.department_id })} options={[
        { value: 'private', label: 'Private · 仅自己', hint: '直接生效，无需审批' },
        { value: 'department', label: 'Department · 指定部门', hint: '含下级部门，需要审批' },
        { value: 'workspace', label: 'Public · 当前工作空间', hint: '面向空间成员，需要审批' },
      ]} />
    </Field>
    {value.visibility === 'department' && <Field label="共享部门"><div className="max-h-36 overflow-auto rounded-lg border border-line p-3">
      {!auth?.departments.length && <p className="text-ink-3">请先由超级管理员建立部门。</p>}
      {auth?.departments.map(d => <label key={d.id} className="flex cursor-pointer items-center gap-2 py-1.5 text-[13px] leading-5"><input className="size-4 shrink-0 accent-volt" type="checkbox" checked={value.department_ids.includes(d.id)} onChange={e => onChange({ ...value, department_ids: e.target.checked ? [...value.department_ids, d.id] : value.department_ids.filter(id => id !== d.id) })} /><span>{d.name}</span></label>)}
    </div></Field>}
    {!privateMode && <Field label="审批归属部门"><Select value={value.department_id || 'super'} onValueChange={v => onChange({ ...value, department_id: v === 'super' ? null : v })} options={[{ value: 'super', label: '由超级管理员审批' }, ...eligible.map(d => ({ value: d.id, label: d.name }))]} /></Field>}
    {agent && <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-glass-2 p-3">
      <input className="mt-0.5 size-4 shrink-0 accent-volt" type="checkbox" checked={!!value.external_access} onChange={e => onChange({ ...value, external_access: e.target.checked })} />
      <span className="min-w-0"><span className="block text-[13px] font-medium leading-5">开启 Web 应用和 API</span><span className="mt-1 block text-[12px] leading-5 text-ink-3">{privateMode ? '随本次发布直接生效，无需审批。API 调用仍需 API Key。' : '随共享发布一起审批，通过后生效。API 调用仍需 API Key。'}</span></span>
    </label>}
    <p className="rounded-lg bg-glass-2 px-3 py-2.5 text-[12px] leading-5 text-ink-3">{privateMode ? 'Private 仅在你的资源列表中可见，发布后立即生效。开启 Web/API 不会将资源共享给部门或工作空间。' : '审批通过前，原线上版本继续服务；可在「我的发布」撤回申请后修改。共享不授予他人编辑权。'}</p>
  </div>
}
export function ReleaseDialog({ kind, id, action = 'share', initial, onClose, onSubmitted }: { kind: string; id: string; action?: string; initial?: ReleaseOptions; onClose: () => void; onSubmitted?: () => void }) {
  const [value, setValue] = useState(initial || emptyRelease), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const direct = value.visibility === 'private'
  const submit = async () => { setBusy(true); setError(''); try { await submitRelease(kind, id, action, note || '更新资源发布与共享范围', value); onSubmitted?.(); onClose(); location.hash = 'releases' } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <Dialog open onOpenChange={v => !v && !busy && onClose()} title={action === 'publish' ? '发布资源' : '设置共享范围'} description={direct ? 'Private 直接生效，无需审批。' : '共享给部门或工作空间，需要审批后生效。'} footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>{direct ? action === 'publish' ? '立即发布' : '保存设置' : '提交审批'}</Button></>}>
    <ReleaseFields value={value} onChange={setValue} agent={kind === 'agent' && action === 'publish'} />
    <Field className="mt-4" label="变更说明"><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="简要说明本次变更，方便后续回溯" /></Field>
    {error && <p role="alert" className="mt-3 text-[13px] text-rose">{error}</p>}
  </Dialog>
}
