/* 按后端 schema 渲染的凭据 / 设置表单：text-input、secret-input、select、radio、boolean、number，支持 show_on 条件显示 */
import type { CredentialFormSchema, CredentialVisibility, FormValues } from '@/api/integrations'
import { RiArrowRightUpLine, RiEyeLine, RiEyeOffLine, RiTeamLine, RiUserLine } from '@remixicon/react'
import { useState } from 'react'
import { tr } from '@/api/integrations'
import { Segmented } from '@/components/ui/segmented'
import { Field, Input, NumberInput, Select } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'

const keyOf = (s: CredentialFormSchema) => s.variable || s.name || ''

/** 当前值下应该显示的字段 */
export function visibleFields(schemas: CredentialFormSchema[], values: FormValues, context: FormValues = {}) {
  const all = { ...context, ...values }
  return schemas.filter(s => !s.show_on?.length || s.show_on.every(c => String(all[c.variable] ?? '') === c.value))
}

/** 带默认值的初始表单 */
export function initialValues(schemas: CredentialFormSchema[], current: FormValues = {}): FormValues {
  const v: FormValues = {}
  for (const s of schemas) {
    const k = keyOf(s)
    v[k] = current[k] ?? s.default ?? (s.type === 'boolean' ? false : '')
  }
  return v
}

/** 校验必填，返回 { 字段: 错误 } */
export function validate(schemas: CredentialFormSchema[], values: FormValues, context: FormValues = {}) {
  const errors: Record<string, string> = {}
  for (const s of visibleFields(schemas, values, context)) {
    const v = values[keyOf(s)]
    if (s.required && s.type !== 'boolean' && (v === undefined || v === ''))
      errors[keyOf(s)] = `请填写${tr(s.label)}`
  }
  return errors
}

/** 只提交可见字段 */
export function pickVisible(schemas: CredentialFormSchema[], values: FormValues, context: FormValues = {}) {
  return Object.fromEntries(visibleFields(schemas, values, context).map(s => [keyOf(s), values[keyOf(s)]]))
}

function Secret({ value, onChange, placeholder, invalid }: { value: string, onChange: (v: string) => void, placeholder?: string, invalid?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} invalid={invalid} className="pr-11 font-mono text-[13px]" autoComplete="off" />
      <button type="button" aria-label={show ? '隐藏' : '显示'} onClick={() => setShow(s => !s)} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-press hover:text-ink">
        {show ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}
      </button>
    </div>
  )
}

export function SchemaForm({ schemas, values, onChange, context, errors = {}, className }: {
  schemas: CredentialFormSchema[]
  values: FormValues
  onChange: (v: FormValues) => void
  /** 参与 show_on 判断的额外值，例如 __model_type */
  context?: FormValues
  errors?: Record<string, string>
  className?: string
}) {
  const set = (k: string, v: FormValues[string]) => onChange({ ...values, [k]: v })
  const fields = visibleFields(schemas, values, context)
  if (!fields.length)
    return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">这个插件不需要额外配置</p>
  return (
    <div className={cn('space-y-4', className)}>
      {fields.map((s) => {
        const k = keyOf(s)
        const v = values[k]
        const ph = tr(s.placeholder) || (s.type === 'select' ? '请选择' : `请输入${tr(s.label)}`)
        const opts = (s.options ?? []).filter(o => !o.show_on?.length || o.show_on.every(c => String({ ...context, ...values }[c.variable] ?? '') === c.value))
        const aside = s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-cyan hover:underline">如何获取<RiArrowRightUpLine className="size-3" /></a> : undefined
        if (s.type === 'boolean') {
          return (
            <div key={k} className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-medium">{tr(s.label)}</p>
                {s.help && <p className="mt-0.5 text-[12px] text-ink-3">{tr(s.help)}</p>}
              </div>
              <Switch aria-label={tr(s.label)} checked={!!v} onCheckedChange={c => set(k, c)} />
            </div>
          )
        }
        return (
          <Field key={k} label={tr(s.label)} required={s.required} error={errors[k]} hint={tr(s.help) || undefined} aside={aside}>
            {s.type === 'secret-input' && <Secret value={String(v ?? '')} onChange={x => set(k, x)} placeholder={ph} invalid={!!errors[k]} />}
            {s.type === 'text-input' && <Input value={String(v ?? '')} onChange={e => set(k, e.target.value)} placeholder={ph} invalid={!!errors[k]} maxLength={s.max_length} />}
            {s.type === 'number' && <NumberInput value={Number(v ?? 0)} onChange={x => set(k, x)} min={s.min} max={s.max} />}
            {s.type === 'select' && <Select value={String(v ?? '')} onValueChange={x => set(k, x)} placeholder={ph} options={opts.map(o => ({ value: o.value, label: tr(o.label) }))} />}
            {s.type === 'radio' && <Segmented value={String(v ?? '')} onValueChange={x => set(k, x)} options={opts.map(o => ({ value: o.value, label: tr(o.label) }))} aria-label={tr(s.label)} />}
          </Field>
        )
      })}
    </div>
  )
}

/** 「谁可以使用」：只有我 / 全体成员 */
export function VisibilityPicker({ value, onChange }: { value: CredentialVisibility, onChange: (v: CredentialVisibility) => void }) {
  return (
    <Field label="谁可以使用" hint={value === 'only_me' ? '只有你能在 Agent里选用这条凭据，其他成员看不到。' : '工作区里所有成员都能选用，凭据内容对他们不可见。'}>
      <Segmented
        value={value}
        onValueChange={onChange}
        aria-label="谁可以使用"
        options={[
          { value: 'only_me', label: <span className="inline-flex items-center gap-1.5"><RiUserLine className="size-3.5" />只有我</span> },
          { value: 'all_team_members', label: <span className="inline-flex items-center gap-1.5"><RiTeamLine className="size-3.5" />全体成员</span> },
        ]}
      />
    </Field>
  )
}
