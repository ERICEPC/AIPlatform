import type { ExternalKnowledgeSet } from '@/api/agent-external-knowledge'
import { blankExternalKnowledge, ExternalKnowledgeDialog, ExternalKnowledgeRows } from './external-knowledge'
import type { Dataset, KnowledgeSet, MetadataCondition, ModelProviderGroup } from '@/api/agents'
import { RiAddLine, RiBookOpenLine, RiCheckLine, RiDeleteBinLine, RiEditLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { listDatasets, listModels } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'
import { AddButton, ChoiceCard, ConfigCard, IconBtn, Row, tx } from '../shared'
import { useConfig } from './context'


/** 发布前校验：返回问题描述 */
export function knowledgeIssues(sets: KnowledgeSet[], external: ExternalKnowledgeSet[] = []) {
  const out: string[] = []
  sets.forEach((s) => {
    if (!s.datasets.length)
      out.push(`知识检索「${s.name}」没有选择知识库`)
    if (s.retrieval.mode === 'multiple' && s.retrieval.reranking_enable && !s.retrieval.reranking_model)
      out.push(`知识检索「${s.name}」开启了 Rerank 但没选模型`)
    if (s.query.mode === 'user_query' && s.query.value === '')
      out.push(`知识检索「${s.name}」选择了自定义查询但内容为空`)
  })
  external.forEach(s => {
    if (!s.name.trim() || !s.library_ids.length) out.push('外部知识库需要填写名称并选择知识库')
  })
  if (external.length > 3) out.push('最多配置 3 组外部知识库')
  const names = [...sets, ...external].map(s => s.name.trim().toLowerCase())
  if (new Set(names).size !== names.length) out.push('知识检索名称不能重复')
  return out
}

export function KnowledgeSection() {
  const { soul, update, changed } = useConfig()
  const sets = soul.knowledge?.sets ?? []
  const external = soul.knowledge?.external_sets ?? []
  const [externalEdit, setExternalEdit] = useState<ExternalKnowledgeSet | null>(null)
  const setExternal = (fn: (l: ExternalKnowledgeSet[]) => ExternalKnowledgeSet[]) => update(s => ({ ...s, knowledge: { ...s.knowledge, external_sets: fn(s.knowledge?.external_sets ?? []) } }))
  const [edit, setEdit] = useState<KnowledgeSet | null>(null)
  const setSets = (fn: (l: KnowledgeSet[]) => KnowledgeSet[]) => update(s => ({ ...s, knowledge: { ...s.knowledge, sets: fn(s.knowledge?.sets ?? []) } }))

  return (
    <ConfigCard
      id="sec-knowledge"
      icon={RiBookOpenLine}
      title="知识检索"
      count={sets.length + external.length}
      changed={changed.has('knowledge')}
      hint={sets.length + external.length ? undefined : '选择知识库模块中的资料库。智能体回答前会查询绑定范围，并根据资料和出处回答；资料不足时明确说明。'}
      actions={<div className="flex flex-wrap gap-2"><AddButton disabled={external.length >= 3} onClick={() => setExternalEdit(blankExternalKnowledge())}>添加知识库</AddButton></div>}
    >
      {sets.length > 0 && (
        <div className="space-y-0.5">
          {sets.map(s => (
            <Row
              key={s.id}
              onClick={() => setEdit(s)}
              tone={s.datasets.length ? undefined : 'warn'}
              icon={<RiBookOpenLine className="size-4 text-cyan" />}
              title={s.name}
              sub={[s.datasets.map(d => d.name).join('、') || '未选择知识库', s.query.mode === 'generated_query' ? 'Agent 决定查询' : '自定义查询', s.retrieval.mode === 'multiple' ? `多路 Top ${s.retrieval.top_k}` : `单路 Top ${s.retrieval.top_k}`, s.metadata_filtering?.mode && s.metadata_filtering.mode !== 'disabled' ? '元数据过滤' : ''].filter(Boolean).join(' · ')}
              right={(
                <>
                  <IconBtn label="编辑" onClick={() => setEdit(s)}><RiEditLine className="size-4" /></IconBtn>
                  <IconBtn label="删除" danger onClick={() => setSets(l => l.filter(x => x.id !== s.id))}><RiDeleteBinLine className="size-4" /></IconBtn>
                </>
              )}
            />
          ))}
        </div>
      )}
      <ExternalKnowledgeRows sets={external} onEdit={setExternalEdit} onDelete={id => setExternal(l => l.filter(s => s.id !== id))} />
      {externalEdit && <ExternalKnowledgeDialog value={externalEdit} names={[...sets, ...external.filter(s => s.id !== externalEdit.id)].map(s => s.name)} onClose={() => setExternalEdit(null)} onSave={v => setExternal(l => l.some(x => x.id === v.id) ? l.map(x => x.id === v.id ? v : x) : [...l, v])} />}
      {edit && (
        <SetDialog
          value={edit}
          isNew={!sets.some(s => s.id === edit.id)}
          names={[...sets.filter(s => s.id !== edit.id), ...external].map(s => s.name)}
          onClose={() => setEdit(null)}
          onSave={v => setSets(l => (l.some(x => x.id === v.id) ? l.map(x => (x.id === v.id ? v : x)) : [...l, v]))}
        />
      )}
    </ConfigCard>
  )
}

function SetDialog({ value, isNew, names, onClose, onSave }: { value: KnowledgeSet, isNew: boolean, names: string[], onClose: () => void, onSave: (v: KnowledgeSet) => void }) {
  const [v, setV] = useState<KnowledgeSet>(value)
  const [touched, setTouched] = useState(false)
  const [datasets, setDatasets] = useState<Dataset[] | null>(null)
  const [rerank, setRerank] = useState<ModelProviderGroup[]>([])
  useEffect(() => {
    listDatasets(1, 100).then(r => setDatasets(r.data)).catch(() => setDatasets([]))
    listModels('rerank').then(r => setRerank(r.data)).catch(() => {})
  }, [])

  const r = v.retrieval
  const mf = v.metadata_filtering ?? { mode: 'disabled' as const }
  const setR = (p: Partial<KnowledgeSet['retrieval']>) => setV(x => ({ ...x, retrieval: { ...x.retrieval, ...p } }))
  const setMf = (p: Partial<NonNullable<KnowledgeSet['metadata_filtering']>>) => setV(x => ({ ...x, metadata_filtering: { mode: 'disabled', ...x.metadata_filtering, ...p } }))
  const conds = mf.conditions ?? []
  const setConds = (fn: (l: MetadataCondition[]) => MetadataCondition[]) => setMf({ conditions: fn(conds) })
  const rerankOpts = rerank.flatMap(g => g.models.map(m => ({ value: `${g.provider}::${m.model}`, label: tx(m.label), hint: tx(g.label) })))

  const nameErr = !v.name.trim() ? '请填写名称' : names.some(n => n.trim().toLowerCase() === v.name.trim().toLowerCase()) ? '已有同名的检索组' : ''
  const dsErr = v.datasets.length ? '' : '至少选择一个知识库'
  const save = () => {
    setTouched(true)
    if (nameErr || dsErr)
      return
    onSave({ ...v, name: v.name.trim() })
    onClose()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()} size="lg" title={isNew ? '添加知识检索' : '编辑知识检索'} footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>{isNew ? '添加' : '保存'}</Button></>}>
      <div className="space-y-5">
        <Field label="名称" required error={touched ? nameErr : undefined} hint="在提示词里引用时显示这个名字。">
          <Input value={v.name} invalid={touched && !!nameErr} placeholder="例如：产品手册检索" onChange={e => setV(x => ({ ...x, name: e.target.value }))} />
        </Field>

        <Field label="查询方式">
          <div className="flex gap-2">
            <ChoiceCard on={v.query.mode === 'generated_query'} title="Agent 决定" desc="根据对话自动改写检索词" onClick={() => setV(x => ({ ...x, query: { mode: 'generated_query', value: x.query.value } }))} />
            <ChoiceCard on={v.query.mode === 'user_query'} title="自定义查询" desc="用固定模板拼出检索词" onClick={() => setV(x => ({ ...x, query: { mode: 'user_query', value: x.query.value ?? '' } }))} />
          </div>
          {v.query.mode === 'user_query' && <Textarea className="mt-2" rows={2} value={v.query.value ?? ''} placeholder="例如：{{sys.query}} 相关的退换货条款" onChange={e => setV(x => ({ ...x, query: { ...x.query, value: e.target.value } }))} />}
        </Field>

        <Field label="知识库" required error={touched ? dsErr : undefined} aside={`已选 ${v.datasets.length}`}>
          {!datasets && <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>}
          {datasets?.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[12.5px] text-ink-3">还没有知识库，先到「知识库」创建。</p>}
          <div className="grid grid-cols-2 gap-2">
            {datasets?.map((d) => {
              const on = v.datasets.some(x => x.id === d.id)
              return (
                <button key={d.id} type="button" onClick={() => setV(x => ({ ...x, datasets: on ? x.datasets.filter(y => y.id !== d.id) : [...x.datasets, { id: d.id, name: d.name }] }))} className={cn('flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors', on ? 'border-volt bg-volt-soft' : 'border-line hover:bg-hover')}>
                  <span className={cn('grid size-4 shrink-0 place-items-center rounded border', on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong')}>{on && <RiCheckLine className="size-3" />}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{d.name}</span>
                    <span className="block text-[11.5px] text-ink-3">{d.document_count} 篇 · {(d.word_count / 10000).toFixed(1)} 万字</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="检索设置">
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <div className="flex items-center gap-3">
              <Segmented size="small" value={r.mode} onValueChange={m => setR({ mode: m })} options={[{ value: 'single', label: '单路' }, { value: 'multiple', label: '多路' }]} />
              <span className="text-[12px] text-ink-3">{r.mode === 'single' ? '按问题选一个最相关的知识库检索' : '同时检索所有知识库后合并排序'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 text-[12.5px] text-ink-2">Top K</p>
                <NumberInput value={r.top_k} min={1} max={20} onChange={n => setR({ top_k: n })} />
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-[12.5px] text-ink-2">相关度阈值<Switch aria-label="相关度阈值" checked={r.score_threshold != null} onCheckedChange={c => setR({ score_threshold: c ? 0.5 : null })} /></p>
                {r.score_threshold != null ? <NumberInput value={r.score_threshold} min={0} max={1} step={0.05} onChange={n => setR({ score_threshold: n })} /> : <p className="flex h-11 items-center text-[12.5px] text-ink-3">不过滤</p>}
              </div>
            </div>
            {r.mode === 'multiple' && (
              <div className="flex items-center gap-3">
                <Switch aria-label="Rerank" checked={!!r.reranking_enable} onCheckedChange={c => setR({ reranking_enable: c })} />
                <span className="text-[13px]">Rerank 重排序</span>
                {r.reranking_enable && (
                  <Select
                    size="sm"
                    className="ml-auto w-[240px]"
                    placeholder="选择 Rerank 模型"
                    value={r.reranking_model ? `${r.reranking_model.provider}::${r.reranking_model.model}` : ''}
                    options={rerankOpts}
                    onValueChange={(x) => { const [provider, model] = x.split('::'); setR({ reranking_model: { provider, model } }) }}
                  />
                )}
              </div>
            )}
          </div>
        </Field>

        <Field label="元数据过滤">
          <Segmented size="small" value={mf.mode} onValueChange={m => setMf({ mode: m })} options={[{ value: 'disabled', label: '关闭' }, { value: 'automatic', label: '自动' }, { value: 'manual', label: '手动' }]} />
          {mf.mode === 'automatic' && <p className="mt-2 text-[12.5px] text-ink-3">Agent 根据问题自动生成过滤条件。</p>}
          {mf.mode === 'manual' && (
            <div className="mt-3 space-y-2 rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
                满足
                <Segmented size="small" value={mf.logical_operator ?? 'and'} onValueChange={o => setMf({ logical_operator: o })} options={[{ value: 'and', label: '全部' }, { value: 'or', label: '任一' }]} />
                条件
              </div>
              {conds.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="h-9 text-[13px]" placeholder="字段，如 region" value={c.name} onChange={e => setConds(l => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Select size="sm" className="w-[120px] shrink-0" value={c.comparison_operator} onValueChange={o => setConds(l => l.map((x, j) => (j === i ? { ...x, comparison_operator: o } : x)))} options={[{ value: 'is', label: '等于' }, { value: 'is not', label: '不等于' }, { value: 'contains', label: '包含' }, { value: 'not contains', label: '不包含' }, { value: 'empty', label: '为空' }]} />
                  <Input className="h-9 text-[13px]" placeholder="值" value={c.value} onChange={e => setConds(l => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <IconBtn label="删除条件" danger onClick={() => setConds(l => l.filter((_, j) => j !== i))}><RiDeleteBinLine className="size-4" /></IconBtn>
                </div>
              ))}
              <Button variant="ghost-accent" size="small" onClick={() => setConds(l => [...l, { name: '', comparison_operator: 'is', value: '' }])}><RiAddLine className="size-3.5" />添加条件</Button>
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  )
}
