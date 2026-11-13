/* 默认模型设置：系统推理模型 / Embedding / Rerank / 语音转文本 / 文本转语音 */
import type { DefaultModelSetting, ModelType } from '@/api/integrations'
import { useEffect, useState } from 'react'
import { getDefaultModel, listModelProviders, listProviderModels, saveDefaultModels, tr } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { errMsg } from '../kit'

const types: { type: ModelType, label: string, hint: string }[] = [
  { type: 'llm', label: '系统推理模型', hint: '用于生成对话标题、推荐下一步问题、提示词生成等系统功能。' },
  { type: 'text-embedding', label: 'Embedding 模型', hint: '知识库文档切片向量化的默认模型。' },
  { type: 'rerank', label: 'Rerank 模型', hint: '检索结果重排序，提升召回准确率。' },
  { type: 'speech2text', label: '语音转文本模型', hint: '对话中语音输入的默认模型。' },
  { type: 'tts', label: '文本转语音模型', hint: '回答朗读的默认模型。' },
]
const SEP = '::'

async function loadAll() {
  const { data: providers } = await listModelProviders()
  const lists = await Promise.all(providers.map(p => listProviderModels(p.provider).then(r => ({ p, models: r.data }))))
  const defaults = await Promise.all(types.map(t => getDefaultModel(t.type).then(r => r.data)))
  return { lists, defaults }
}

/** 读取 + 编辑 + 保存默认模型；对话框和设置面板共用 */
function useDefaultModels(enabled: boolean) {
  const toast = useToast()
  const { data, error, loading, reload } = useQuery(loadAll, [enabled], { enabled })
  const [values, setValues] = useState<Partial<Record<ModelType, string>>>({})
  const [base, setBase] = useState<Partial<Record<ModelType, string>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data)
      return
    const init = Object.fromEntries(types.map((t, i) => [t.type, data.defaults[i] ? `${data.defaults[i]!.provider.provider}${SEP}${data.defaults[i]!.model}` : '']))
    setBase(init)
    setValues(init)
  }, [data])

  const dirty = !!data && types.some(t => (values[t.type] ?? '') !== (base[t.type] ?? ''))

  const save = async () => {
    setSaving(true)
    try {
      const settings: DefaultModelSetting[] = types.map((t) => {
        const [provider = '', model = ''] = (values[t.type] ?? '').split(SEP)
        return { model_type: t.type, provider, model }
      })
      await saveDefaultModels(settings)
      setBase(values)
      toast('默认模型已保存')
      return true
    }
    catch (e) {
      toast(errMsg(e), 'info')
      return false
    }
    finally {
      setSaving(false)
    }
  }

  return { data, error, loading, reload, values, setValues, saving, save, dirty, reset: () => setValues(base) }
}

function DefaultModelFields({ state }: { state: ReturnType<typeof useDefaultModels> }) {
  const { data, error, loading, reload, values, setValues } = state
  return (
    <>
      {error && <ErrorBar error={error} onRetry={reload} />}
      {loading || !data
        ? <div className="space-y-4 pb-2">{types.map(t => <Skeleton key={t.type} className="h-[72px] rounded-2xl" />)}</div>
        : (
            <div className="space-y-4 pb-2">
              {types.map((t) => {
                const options = data.lists.flatMap(({ p, models }) => models
                  .filter(m => m.model_type === t.type && m.status === 'active')
                  .map(m => ({ value: `${p.provider}${SEP}${m.model}`, label: `${tr(m.label)}`, hint: tr(p.label) })))
                return (
                  <Field key={t.type} label={t.label} hint={options.length ? t.hint : '还没有可用的这类模型，先在供应商里启用或添加。'}>
                    <Select
                      value={values[t.type] ?? ''}
                      onValueChange={v => setValues(s => ({ ...s, [t.type]: v }))}
                      options={options}
                      placeholder={options.length ? '选择模型' : '暂无可选模型'}
                      disabled={!options.length}
                    />
                  </Field>
                )
              })}
            </div>
          )}
    </>
  )
}

export function DefaultModelDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const state = useDefaultModels(open)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="默认模型"
      description="各功能没有单独指定模型时使用这里的设置。只能选择已启用的模型。"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" loading={state.saving} disabled={!state.data} onClick={async () => { if (await state.save()) onOpenChange(false) }}>保存</Button></>}
    >
      <DefaultModelFields state={state} />
    </Dialog>
  )
}

/** 内嵌版（个人设置 → 默认模型）：表单 + 底部保存栏 */
export function DefaultModelPanel({ onSaved }: { onSaved?: () => void }) {
  const state = useDefaultModels(true)
  return (
    <div>
      <DefaultModelFields state={state} />
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-line pt-4">
        {state.dirty && <span className="mr-auto text-[12px] text-amber">有未保存的修改</span>}
        <Button variant="ghost" disabled={!state.dirty || state.saving} onClick={state.reset}>还原</Button>
        <Button variant="primary" loading={state.saving} disabled={!state.data || !state.dirty} onClick={async () => { if (await state.save()) onSaved?.() }}>保存</Button>
      </div>
    </div>
  )
}
