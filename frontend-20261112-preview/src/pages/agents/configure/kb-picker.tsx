import type { KbLibrary } from '@/api/knowledge'
import { RiCheckLine, RiDatabase2Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { listKnowledgeBases } from '@/api/knowledge'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/** 可访问的知识库子库（只读调用知识库模块接口） */
export function useKbLibraries() {
  const [libs, setLibs] = useState<KbLibrary[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setError(null)
    listKnowledgeBases().then(r => alive && setLibs(r)).catch(e => alive && setError(e))
    return () => {
      alive = false
    }
  }, [tick])
  return { libs, error, reload: () => setTick(t => t + 1) }
}

/**
 * 知识库子库选择弹窗。multiple 时可多选并「确定」；单选时点一下即提交。
 * 知识库模块的 KbLibraryPicker 就绪后可替换为它（props 一致：value / onChange / multiple）。
 */
export function KbPickerDialog({ open, title, description, value, multiple, confirmText = '确定', onClose, onConfirm }: {
  open: boolean
  title: string
  description?: string
  value: string[]
  multiple?: boolean
  confirmText?: string
  onClose: () => void
  onConfirm: (libs: KbLibrary[]) => void
}) {
  const { libs, error, reload } = useKbLibraries()
  const [sel, setSel] = useState<string[]>(value)
  useEffect(() => {
    if (open)
      setSel(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (l: KbLibrary) => {
    if (!multiple) {
      onConfirm([l])
      onClose()
      return
    }
    setSel(s => (s.includes(l.id) ? s.filter(x => x !== l.id) : [...s, l.id]))
  }
  const submit = () => {
    onConfirm((libs ?? []).filter(l => sel.includes(l.id)))
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => !o && onClose()}
      size="md"
      title={title}
      description={description}
      footer={multiple ? <><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" disabled={!libs} onClick={submit}>{confirmText}{sel.length > 0 && `（${sel.length}）`}</Button></> : undefined}
    >
      {error && <ErrorBar error={error} onRetry={reload} />}
      {!libs && !error && <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>}
      {libs?.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">还没有可用的知识库，先到「知识库」新建一个。</p>}
      {libs && libs.length > 0 && (
        <div className="max-h-[420px] space-y-1.5 overflow-auto">
          {libs.map((l) => {
            const on = sel.includes(l.id)
            return (
              <button key={l.id} type="button" onClick={() => pick(l)} className={cn('flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors', on ? 'border-volt bg-volt-soft' : 'border-line hover:bg-hover')}>
                {multiple
                  ? <span className={cn('grid size-4 shrink-0 place-items-center rounded border', on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong')}>{on && <RiCheckLine className="size-3" />}</span>
                  : <RiDatabase2Line className={cn('size-4 shrink-0', on ? 'text-volt-text' : 'text-cyan')} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{l.baseName}</span>
                  <span className="block truncate text-[12px] text-ink-3">{l.description || '暂无简介'}</span>
                </span>
                <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{l.documentCount} 个文件</span>
                {!multiple && on && <span className="shrink-0 text-[12px] text-volt-text">当前</span>}
              </button>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}
