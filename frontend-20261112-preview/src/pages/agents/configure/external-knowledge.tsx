import { useEffect, useState } from 'react'
import { RiBookOpenLine, RiDeleteBinLine, RiEditLine } from '@remixicon/react'
import type { ExternalKnowledgeOptions, ExternalKnowledgeSet } from '@/api/agent-external-knowledge'
import { externalKnowledgeOptions } from '@/api/agent-external-knowledge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { IconBtn, Row } from '../shared'

export const blankExternalKnowledge = (): ExternalKnowledgeSet => ({ id: `external-${crypto.randomUUID()}`, name: '', provider: 'knowledge_bridge', identity_mode: 'caller', capability: 'material_qa', execution: 'before_answer', description: '', library_ids: [], document_id: null })

export function ExternalKnowledgeRows({ sets, onEdit, onDelete }: { sets: ExternalKnowledgeSet[], onEdit: (s: ExternalKnowledgeSet) => void, onDelete: (id: string) => void }) {
  return <>{sets.map(s => <Row key={s.id} title={s.name} onClick={() => onEdit(s)} icon={<RiBookOpenLine className="size-4 text-cyan" />} sub={`外部知识库 · ${s.library_ids.length} 个库${s.document_id ? ' · 指定材料' : ''} · 回答前查询 · 按调用者权限`} right={<><IconBtn label="编辑外部知识库" onClick={() => onEdit(s)}><RiEditLine className="size-4" /></IconBtn><IconBtn label="删除外部知识库" danger onClick={() => onDelete(s.id)}><RiDeleteBinLine className="size-4" /></IconBtn></>} />)}</>
}

export function ExternalKnowledgeDialog({ value, names, onClose, onSave }: { value: ExternalKnowledgeSet, names: string[], onClose: () => void, onSave: (v: ExternalKnowledgeSet) => void }) {
  const [selected, setSelected] = useState(value.library_ids)
  const [options, setOptions] = useState<ExternalKnowledgeOptions | null>(null)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setOptions(null); setLoadError('')
    externalKnowledgeOptions(controller.signal).then(setOptions).catch(e => { if (!controller.signal.aborted) setLoadError(e.message) })
    return () => controller.abort()
  }, [revision])
  const missing = options ? selected.filter(id => !options.libraries.some(l => l.id === id)) : []
  const valid = !!options && selected.length > 0 && selected.length <= 10 && !missing.length
  const save = () => {
    if (!valid || !options) return
    const base = selected.map(id => options.libraries.find(l => l.id === id)!.name).join('、').slice(0, 240)
    let name = base, suffix = 2
    while (names.some(n => n.trim().toLowerCase() === name.toLowerCase())) name = `${base}（${suffix++}）`
    onSave({ ...value, name, library_ids: selected, document_id: null })
    onClose()
  }
  return <Dialog open onOpenChange={o => !o && onClose()} size="md" title="挂载知识库" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" disabled={!valid} onClick={save}>保存</Button></>}>
    <div className="space-y-4 text-[13px]">
      <p className="leading-relaxed text-ink-2">选择智能体回答时使用的知识库，回答将结合资料并注明出处。</p>
      {loadError ? <div role="alert" className="space-y-2 rounded-xl border border-line p-3"><p>{loadError}</p><Button size="small" onClick={() => setRevision(x => x + 1)}>重新加载</Button><a className="ml-3 text-cyan" href="#kb">前往知识库</a></div> : !options ? <p className="text-ink-3">正在加载知识库…</p> : <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
        {!options.libraries.length && <p className="p-3 text-ink-3">暂无可挂载的知识库，请先在知识库模块添加。</p>}
        {options.libraries.map(l => <label key={l.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-hover"><input type="checkbox" checked={selected.includes(l.id)} disabled={!selected.includes(l.id) && selected.length >= 10} onChange={e => setSelected(ids => e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id))} /><span className="min-w-0 flex-1 break-words">{l.name}</span><span className="shrink-0 text-ink-3">{l.document_count} 份可检索材料</span></label>)}
        {missing.map(id => <label key={id} className="flex items-center gap-3 p-3 text-red-600"><input type="checkbox" checked onChange={() => setSelected(ids => ids.filter(x => x !== id))} /><span>此知识库已不可访问，请取消勾选</span></label>)}
      </div>}
      <p className="text-ink-3">已选择 {selected.length} 个，最多 10 个。保存后可在右侧预览中测试回答。</p>
    </div>
  </Dialog>
}
