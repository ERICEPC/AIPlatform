import { ReleaseDialog, emptyRelease } from './release-dialog'
import { useEffect, useState } from 'react'
import { request } from '@/api/http'
import { RiArrowDownSLine } from '@remixicon/react'

type Visibility = { visibility: 'private' | 'public' | 'department'; can_manage: boolean; department_ids?:string[] }
/** Public is workspace sharing, independent of publishing a Web app. */
export function ResourceVisibility({ kind, id, onLoaded }: { kind: 'agent' | 'skill' | 'mcp'; id: string; onLoaded?: (value: Visibility) => void }) {
  const [data, setData] = useState<Visibility>()
  const [sharing, setSharing] = useState<string|null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const path = `/resource-visibility/${kind}/${encodeURIComponent(id)}`
  useEffect(() => {
    let alive = true
    setData(undefined); setError('')
    request<Visibility>({ method: 'GET', path }, () => ({ visibility: 'private', can_manage: true }))
      .then(r => { if (alive) { setData(r); onLoaded?.(r) } }).catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [path, onLoaded])
  async function change(visibility: string) {
    if(visibility !== 'private'){setSharing(visibility);return}
    setBusy(true); setError('')
    try { setData(await request<Visibility>({ method: 'PUT', path, body: { visibility } }, () => ({ visibility: visibility as Visibility['visibility'], can_manage: true }))) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="my-2 text-xs" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    {data ? <div className="flex flex-wrap items-center gap-2">
      <div className="relative inline-flex shrink-0 items-center">
      <select aria-label="资源可见性" title="Public 仅对同一工作空间的员工共享，不公开到互联网；仅创建者可管理。" disabled={!data.can_manage || busy} value={data.visibility} onChange={e => change(e.target.value)} className="h-8 appearance-none rounded-full border border-line bg-glass-2 pl-3 pr-9 text-ink outline-none focus:border-volt disabled:cursor-default">
        <option value="private">Private · 仅自己</option><option value="department">Department · 部门</option><option value="public">Public · 工作空间</option>
      </select>
      <RiArrowDownSLine aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      </div>
      <span className="text-ink-3">{busy ? '保存中…' : data.can_manage ? (data.visibility === 'public' ? '其他员工可见并可选用' : data.visibility === 'department' ? '授权部门成员可见并可选用' : '仅你可见') : '共享资源 · 仅创建者可管理'}</span>
    </div> : !error && <span className="text-ink-3">加载可见性…</span>}
    {sharing && <ReleaseDialog kind={kind} id={id} initial={{...emptyRelease,visibility:sharing==='public'?'workspace':'department',department_ids:data?.department_ids||[]}} onClose={()=>setSharing(null)}/>}
    {error && <p role="alert" className="mt-1 text-rose">{error}</p>}
  </div>
}
