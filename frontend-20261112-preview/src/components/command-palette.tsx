import { RiArrowRightLine, RiBookOpenLine, RiCommunityLine, RiCornerDownLeftLine, RiFlashlightLine, RiLayoutGridLine, RiSearchLine } from '@remixicon/react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listAgents, listBuiltinAgents } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { request } from '@/api/http'
import { listLibrarySkills } from '@/api/agents'
import { Kbd } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/* 全局搜索（⌘K / Ctrl+K）：页面、Agent、知识库、Skill，方向键选择，回车打开 */
type Item = { id: string, group: string, label: string, hint?: string, to: string, icon: React.ComponentType<{ className?: string }> }

const PAGES: Item[] = [
  ['assistant', '个人助手'], ['collab', '智能体协同'], ['review', '待我核对'], ['agents/enterprise', 'Agents · 企服'], ['agents/mine', 'Agents · 我的'],
  ['kb', '知识库'], ['skills', 'Skills'], ['integrations', 'MCP'], ['integrations/marketplace', 'MCP · 插件市场'],
].map(([to, label]) => ({ id: `p:${to}`, group: '页面', label, to, icon: RiLayoutGridLine }))

export function CommandPalette({ open, onOpenChange, go }: { open: boolean, onOpenChange: (v: boolean) => void, go: (path: string) => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const mine = useQuery(() => listAgents({ page: 1, limit: 100 }), [], { enabled: open })
  const builtin = useQuery(() => listBuiltinAgents('sales'), [], { enabled: open })
  const kbs = useQuery(() => request<{data:{id:string;name:string;document_count:number}[]}>({method:'GET',path:'/datasets',query:{page:1,limit:100}},()=>({data:[]})), [], { enabled: open })
  const skills = useQuery(() => listLibrarySkills({page:1}), [], { enabled: open })

  const all = useMemo<Item[]>(() => [
    ...PAGES,
    ...(mine.data?.data ?? []).map(a => ({ id: `a:${a.id}`, group: 'Agent', label: a.name, hint: a.role || '我的', to: `agents/${a.id}`, icon: RiCommunityLine })),
    ...(builtin.data?.data ?? []).map(a => ({ id: `b:${a.id}`, group: 'Agent', label: a.name, hint: 'SalesBuddy 内置', to: `agents/${a.id}`, icon: RiCommunityLine })),
    ...(kbs.data?.data ?? []).map(k => ({ id: `k:${k.id}`, group: '知识库', label: k.name, hint: `${k.document_count} 份材料`, to: `kb/${k.id}`, icon: RiBookOpenLine })),
    ...(skills.data?.data ?? []).map(s => ({ id: `s:${s.id}`, group: 'Skill', label: s.name, hint: s.description, to: `skills/native/${s.id}`, icon: RiFlashlightLine })),
  ], [mine.data, builtin.data, kbs.data, skills.data])

  const kw = q.trim().toLowerCase()
  const shown = (kw ? all.filter(x => `${x.label} ${x.hint ?? ''}`.toLowerCase().includes(kw)) : PAGES).slice(0, 40)
  const loading = open && kw && (mine.loading || builtin.loading || kbs.loading || skills.loading)

  useEffect(() => {
    if (!open) {
      setQ('')
      setI(0)
    }
  }, [open])
  useEffect(() => setI(0), [kw])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [i])

  const pick = (x?: Item) => {
    if (!x)
      return
    onOpenChange(false)
    go(x.to)
  }

  let lastGroup = ''
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup aria-label="全局搜索" className="glass-3 fixed top-[14vh] left-1/2 z-[81] w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[24px] shadow-float transition-[opacity,transform] duration-200 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <label className="flex h-14 items-center gap-3 border-b border-line px-5">
            <RiSearchLine className="size-5 text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setI(v => Math.min(shown.length - 1, v + 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setI(v => Math.max(0, v - 1)) }
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); pick(shown[i]) }
              }}
              placeholder="搜索页面、Agent、知识库、Skill"
              aria-label="搜索"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
            <Kbd>Esc</Kbd>
          </label>
          <div ref={listRef} className="max-h-[52vh] overflow-auto p-2" role="listbox">
            {shown.map((x, idx) => {
              const head = x.group !== lastGroup
              lastGroup = x.group
              return (
                <div key={x.id}>
                  {head && <p className="px-3 pt-2.5 pb-1 text-[11.5px] font-medium text-ink-3">{kw ? x.group : '快速跳转'}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === i}
                    data-idx={idx}
                    onMouseMove={() => setI(idx)}
                    onClick={() => pick(x)}
                    className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left', idx === i ? 'bg-hover' : '')}
                  >
                    <x.icon className={cn('size-4 shrink-0', idx === i ? 'text-volt-text' : 'text-ink-3')} />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{x.label}</span>
                    {x.hint && <span className="max-w-[45%] truncate text-[12px] text-ink-3">{x.hint}</span>}
                    {idx === i ? <RiCornerDownLeftLine className="size-3.5 text-ink-3" /> : <RiArrowRightLine className="size-3.5 text-transparent" />}
                  </button>
                </div>
              )
            })}
            {!shown.length && <p className="py-12 text-center text-[13px] text-ink-3">{loading ? '正在搜索…' : `没有找到「${q}」相关的内容`}</p>}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

/** ⌘K / Ctrl+K 打开 */
export function useCommandShortcut(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
}
