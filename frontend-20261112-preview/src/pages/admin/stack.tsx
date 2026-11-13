import type { ComponentCategory, StackComponent, TestResult } from '@/api/admin'
import type { FieldValue } from '@/components/console'
import { RiDownload2Line, RiLock2Line, RiPlugLine, RiSave3Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { CATEGORY, exportStack, listComponents, saveComponent, testComponent } from '@/api/admin'
import { ConsolePage, KV, PageHeader, SchemaForm, Section, StatusTag } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/*
  AI 技术栈组件（超级管理员配置；普通管理员只读）：
  每个组件一页：连接配置（地址、账号、密钥、运行参数）→ 测试连接 → 保存；顶部可导出后端连接配置（.env / JSON）。
  后端接入时按 docs/后端连接配置.md 把这些配置写入部署环境，密钥放到密钥管理。
*/
const ORDER: ComponentCategory[] = ['data', 'model', 'runtime', 'knowledge', 'tools', 'devkit', 'security', 'observe']
export function StackPage({ id, go, canEdit }: { id?: string, go: (p: string) => void, canEdit: boolean }) {
  const q = useQuery(listComponents, [])
  const list = q.data?.data ?? []
  const cur = list.find(c => c.id === id) ?? list[0]
  const [exp, setExp] = useState<{ env: string, json: string } | null>(null)
  const [fmt, setFmt] = useState<'env' | 'json'>('env')
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  async function handleExport() {
    setExporting(true)
    try { setExp(await exportStack()) }
    catch (e) { toast((e as Error).message, 'info') }
    finally { setExporting(false) }
  }
  const ok = list.filter(c => c.status === 'ok').length
  return (
    <ConsolePage
      bodyClass="p-0 flex min-h-0"
      header={<PageHeader title="AI 技术栈组件" desc={canEdit ? '统一管理平台基础服务的连接、运行参数与健康状态。开发模板与功能包在技术开发栈中管理。' : '查看平台组件的状态与健康。连接配置只有超级管理员可以修改。'} meta={<Badge tone="mint">{ok} / {list.length} 正常</Badge>} actions={canEdit && <Button loading={exporting} onClick={handleExport}><RiDownload2Line className="size-4" />导出后端连接配置</Button>} />}
    >
      <nav className="w-[260px] shrink-0 overflow-auto border-r border-line bg-solid p-2">
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        {ORDER.filter(cat => list.some(c => c.category === cat)).map(cat => (
          <div key={cat} className="mb-2">
            <p className="px-3 pt-2 pb-1 text-[11.5px] font-medium text-ink-3">{CATEGORY[cat]}</p>
            {list.filter(c => c.category === cat).map(c => (
              <button key={c.id} type="button" onClick={() => go(`admin/stack/${c.id}`)} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-[13px]', c.id === cur?.id ? 'bg-volt-soft font-medium text-volt-text' : 'hover:bg-hover')}>
                <i className={cn('size-1.5 shrink-0 rounded-full', { ok: 'bg-mint', warn: 'bg-amber', error: 'bg-rose', off: 'bg-ink-3', pending: 'bg-volt' }[c.status])} />
                <span className="flex-1 truncate">{c.name}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto p-6">{cur && <ComponentDetail key={cur.id} c={cur} canEdit={canEdit} onSaved={q.reload} />}</div>
      <Dialog open={!!exp} onOpenChange={o => !o && setExp(null)} size="xl" title="后端连接配置" description="把这份配置写入后端部署环境；密钥以占位符输出，请在密钥管理里填写真实值。" footer={<><Segmented size="small" value={fmt} onValueChange={setFmt} aria-label="格式" options={[{ value: 'env', label: '.env' }, { value: 'json', label: 'JSON' }]} /><Button variant="primary" onClick={() => { const blob = new Blob([fmt === 'env' ? exp!.env : exp!.json], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fmt === 'env' ? 'raccoonx-backend.env' : 'raccoonx-backend.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }}><RiDownload2Line className="size-4" />下载</Button></>}>
        <pre className="max-h-[56vh] overflow-auto rounded-lg border border-line bg-surface p-4 font-mono text-[12px] leading-relaxed">{fmt === 'env' ? exp?.env : exp?.json}</pre>
      </Dialog>
    </ConsolePage>
  )
}

function ComponentDetail({ c, canEdit, onSaved }: { c: StackComponent, canEdit: boolean, onSaved: () => void }) {
  const toast = useToast()
  const [values, setValues] = useState<Record<string, FieldValue>>(c.values)
  const [test, setTest] = useState<TestResult | null>(null)
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('')
  useEffect(() => { setValues(c.values); setTest(null) }, [c])
  const dirty = JSON.stringify(values) !== JSON.stringify(c.values)
  async function handleAction(action: 'test' | 'save') {
    if (busy) return
    setBusy(action)
    try {
      if (action === 'test') setTest(await testComponent(c.id, values))
      else { await saveComponent(c.id, values); toast('已保存连接配置'); onSaved() }
    }
    catch (e) { toast((e as Error).message, 'info') }
    finally { setBusy('') }
  }
  return (
    <div className="space-y-4">
      <Section title={<span className="flex items-center gap-2">{c.name}<span className="text-[13px] font-normal text-ink-3">{c.product}</span></span>} desc={c.desc} actions={<StatusTag status={c.status} />}>
        <KV cols={4} items={[['分类', CATEGORY[c.category]], ['版本', c.version], ['延迟', c.latency_ms == null ? '—' : `${c.latency_ms} 毫秒`], ['最近检查', new Date(c.last_check).toLocaleTimeString('zh-CN')]]} />
        <div className="mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <div className="rounded-lg bg-surface p-3 text-[12.5px]"><p className="font-medium text-ink-2">关联功能</p><p className="mt-1 text-ink">{c.used_by.join('、')}</p></div>
          <div className="rounded-lg bg-surface p-3 text-[12.5px]"><p className="font-medium text-ink-2">工作台使用入口</p><p className="mt-1 text-ink">{c.user_side}</p></div>
        </div>
      </Section>
      <Section
        title="连接配置"
        desc={canEdit ? '修改后先测试再保存；密钥字段留空表示不修改。' : undefined}
        actions={canEdit
          ? <><Button disabled={!!busy || !dirty} onClick={() => { setValues(c.values); setTest(null) }}>重置</Button><Button loading={busy === 'test'} disabled={!!busy} onClick={() => handleAction('test')}><RiPlugLine className="size-4" />测试连接</Button><Button variant="primary" loading={busy === 'save'} disabled={!!busy || !dirty} onClick={() => handleAction('save')}><RiSave3Line className="size-4" />保存</Button></>
          : <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><RiLock2Line className="size-4" />只读</span>}
      >
        <SchemaForm fields={c.fields} value={values} disabled={!canEdit || !!busy} onChange={(k, v) => { setValues(x => ({ ...x, [k]: v })); setTest(null) }} />
      </Section>
      {test && (
        <Section title={test.ok ? '测试通过' : '测试未通过'} actions={<Badge tone={test.ok ? 'mint' : 'rose'}>{test.ok ? `${test.latency_ms} 毫秒` : '请检查必填项'}</Badge>}>
          <ol className="space-y-2">{test.steps.map(s => <li key={s.name} className="flex items-center gap-3 text-[13px]"><i className={cn('size-2 rounded-full', s.ok ? 'bg-mint' : 'bg-rose')} /><span className="w-24 font-medium">{s.name}</span><span className="text-ink-2">{s.detail}</span></li>)}</ol>
        </Section>
      )}
    </div>
  )
}
