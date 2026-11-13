import type { KbLibraryItem } from '@/api/knowledge'
import { RiCheckLine, RiFolderOpenLine, RiFolderSharedLine, RiSearchLine } from '@remixicon/react'
import { useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listKnowledgeBases } from '@/api/knowledge'
import { listDemoKnowledgeBases } from '@/api/personal-demo'
import { Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

export type KbLibraryPickerProps = {
  /** 选中的知识库 id */
  demo?: boolean
  value: string[]
  onChange: (ids: string[]) => void
  /** 多选（复选框）；false 时单选，再点一次取消 */
  multiple?: boolean
}

/*
  知识库选择器（供 Agent 配置「文件」分区关联知识库子库等场景复用）。
  自带数据：listKnowledgeBases()；分组「我的库」「共享给我的」，可搜索，显示文件数。
*/
export function KbLibraryPicker({ value, onChange, multiple = false, demo = false }: KbLibraryPickerProps) {
  const libs = useQuery(demo ? listDemoKnowledgeBases : listKnowledgeBases, [demo])
  const [kw, setKw] = useState('')
  const selected = new Set(value)

  const groups = useMemo(() => {
    const k = kw.trim().toLowerCase()
    const list = (libs.data ?? []).filter(l => !k || `${l.name} ${l.description ?? ''}`.toLowerCase().includes(k))
    return [
      { title: '我的库', items: list.filter(l => l.ownedByMe) },
      { title: '共享给我的', items: list.filter(l => !l.ownedByMe) },
    ].filter(g => g.items.length)
  }, [libs.data, kw])

  const toggle = (id: string) => {
    if (multiple)
      onChange(selected.has(id) ? value.filter(v => v !== id) : [...value, id])
    else
      onChange(selected.has(id) ? [] : [id])
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-9 items-center gap-2 rounded-2xl border border-line-strong bg-hover px-3 transition-[border-color,box-shadow] focus-within:border-volt focus-within:shadow-glow-volt">
        <RiSearchLine className="size-4 shrink-0 text-ink-3" />
        <input
          value={kw}
          onChange={e => setKw(e.target.value)}
          placeholder="搜索知识库"
          aria-label="搜索知识库"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
        {multiple && value.length > 0 && <span className="shrink-0 text-[11.5px] text-volt-text tabular-nums">已选 {value.length}</span>}
      </label>

      <div role={multiple ? 'group' : 'radiogroup'} aria-label="选择知识库" className="max-h-[320px] overflow-y-auto rounded-2xl border border-line p-1">
        {libs.loading
          ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="mx-2 my-2.5 h-5" />)
          : libs.error
            ? <p className="px-3 py-3 text-[12.5px] text-rose">知识库列表加载失败。<button type="button" className="cursor-pointer underline" onClick={libs.reload}>重试</button></p>
            : !groups.length
                ? <p className="px-3 py-3 text-[12.5px] text-ink-3">{kw.trim() ? '没有匹配的知识库，换个关键词试试。' : '暂无可访问的知识库，可以先在知识库里新建一个私有库。'}</p>
                : groups.map(g => (
                    <div key={g.title} className="mb-1 last:mb-0">
                      <p className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-ink-3">{g.title}<span className="tabular-nums">{g.items.length}</span></p>
                      {g.items.map(l => <Row key={l.id} lib={l} on={selected.has(l.id)} multiple={multiple} onClick={() => toggle(l.id)} />)}
                    </div>
                  ))}
      </div>
    </div>
  )
}

function Row({ lib, on, multiple, onClick }: { lib: KbLibraryItem, on: boolean, multiple: boolean, onClick: () => void }) {
  const Icon = lib.ownedByMe ? RiFolderOpenLine : RiFolderSharedLine
  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={on}
      onClick={onClick}
      className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors', on ? 'bg-volt-soft' : 'hover:bg-hover')}
    >
      <span className={cn('grid size-4 shrink-0 place-items-center border transition-colors', multiple ? 'rounded-[5px]' : 'rounded-full', on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong')}>
        {on && <RiCheckLine className="size-3" />}
      </span>
      <Icon className={cn('size-4 shrink-0', on ? 'text-volt-text' : 'text-ink-3')} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px]', on ? 'font-semibold text-ink' : 'text-ink')}>{lib.name}</span>
        {lib.description && <span className="block truncate text-[11.5px] text-ink-3">{lib.description}</span>}
      </span>
      <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">{lib.count} 份</span>
    </button>
  )
}
