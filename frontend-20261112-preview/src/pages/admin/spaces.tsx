import type { FieldValue } from '@/components/console'
import { RiBriefcase4Line, RiSave3Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listSpaces, saveSpace } from '@/api/admin'
import { ConsolePage, KV, PageHeader, SchemaForm, Section } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Badge, EmptyState, Progress } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/*
  业务空间：按部门或业务划分。普通管理员为自己管理的业务配置资源，开放给更多人使用：
  分配数据库 schema 与配额、向量集合与存储目录、知识库空间、模型额度、可调用的 xBuddy、默认可见范围。
  组件本身的连接（例如 PostgreSQL 地址）由超级管理员在「AI 技术栈组件」里配置。
*/
export function SpacesPage({ id, go }: { id?: string, go: (p: string) => void }) {
  const toast = useToast()
  const q = useQuery(listSpaces, [])
  const list = q.data?.data ?? []
  const cur = list.find(s => s.id === id) ?? list[0]
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = !!cur && JSON.stringify(values) !== JSON.stringify(cur.values)
  const save = async () => {
    if (!cur || busy) return
    const missing = cur.fields.find(f => f.required && (values[f.key] === '' || values[f.key] == null))
    if (missing) { setError(`请填写${missing.label}`); return }
    if (Object.values(values).some(v => typeof v === 'number' && (!Number.isFinite(v) || v < 0))) { setError('配额与数值不能小于 0'); return }
    setBusy(true); setError('')
    try { await saveSpace(cur.id, values); await q.reload(); toast('业务空间已保存') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { if (cur) setValues(cur.values) }, [cur?.id, cur]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ConsolePage header={<PageHeader title="业务空间" desc="为一个部门或业务分配平台资源；空间内的成员、智能体、智能体团队与 xBuddy 只使用本空间的数据与额度。" />}>
      <div className="grid w-full grid-cols-[280px_1fr] gap-5 max-xl:grid-cols-1">
        <Section title="我管理的空间" bodyClass="p-2">
          {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
          {!list.length && !q.loading && <EmptyState icon={<RiBriefcase4Line className="size-5" />} title="没有可管理的业务空间" hint="由超级管理员创建并授权。" />}
          {list.map(s => (
            <button key={s.id} type="button" onClick={() => { if (!dirty || window.confirm("有未保存的配置，是否放弃并切换空间？")) { setError(''); go(`admin/spaces/${s.id}`) } }} className={cn('block w-full cursor-pointer rounded-md px-3 py-2.5 text-left', s.id === cur?.id ? 'bg-volt-soft' : 'hover:bg-hover')}>
              <span className="block text-[13.5px] font-medium">{s.name}</span>
              <span className="mt-0.5 block text-[12px] text-ink-3">{s.members} 位成员 · {s.agents} 个智能体 · {s.apps.join('、')}</span>
            </button>
          ))}
        </Section>
        {cur && (
          <div className="space-y-5">
            <Section title={cur.name} desc={cur.desc}>
              <KV cols={4} items={[['管理员', cur.admins.join('、')], ['成员', cur.members], ['智能体 / 智能体团队', `${cur.agents} / ${cur.workflows}`], ['xBuddy', cur.apps.join('、')]]} />
              <div className="mt-5 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                {cur.resources.map(r => (
                  <div key={r.name} className="rounded-lg border border-line p-3">
                    <p className="flex items-center justify-between text-[13px] font-medium">{r.name}<Badge>{{ database: '数据库', vector: '向量', object: '存储', kb: '知识库', model: '模型', app: '应用' }[r.kind]}</Badge></p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{r.detail}{r.quota ? ` · ${r.usage} / ${r.quota} ${r.unit}` : ''}</p>
                    {r.quota && <div className="mt-2"><Progress value={((r.usage ?? 0) / r.quota) * 100} /></div>}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="为业务配置" desc="保存后对空间内成员生效；发布审批固定开启。" actions={<><Button disabled={!dirty||busy} onClick={() => {setValues({...cur.values});setError('')}}>重置</Button><Button variant="primary" disabled={!dirty||busy} onClick={save}><RiSave3Line className="size-4" />{busy ? '保存中…' : '保存配置'}</Button></>}>
              {error && <p role="alert" className="mb-4 text-sm text-rose">{error}</p>}
              <SchemaForm fields={cur.fields} value={values} onChange={(k, v) => setValues(x => ({ ...x, [k]: v }))} />
            </Section>
          </div>
        )}
      </div>
    </ConsolePage>
  )
}
