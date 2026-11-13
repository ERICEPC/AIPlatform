import type { RefItem, RefKind } from './context'
import { RiAtLine, RiBookOpenLine, RiCheckLine, RiFileCopyLine, RiFileTextLine, RiFlashlightLine, RiQuillPenLine, RiTerminalBoxLine, RiToolsLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { ConfigCard } from '../shared'
import { REF_LABEL, REF_RE, referenceables, refToken, useConfig } from './context'

export const REF_ICON: Record<RefKind, React.ComponentType<{ className?: string }>> = { skill: RiFlashlightLine, file: RiFileTextLine, tool: RiToolsLine, cli_tool: RiTerminalBoxLine, knowledge: RiBookOpenLine }

/** 引用 chip：存在时青色，不存在时玫瑰色并标「不存在」 */
export function RefChip({ kind, label, missing }: { kind: string, label: string, missing?: boolean }) {
  const Icon = REF_ICON[kind as RefKind] ?? RiAtLine
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[12px] font-medium', missing ? 'border-rose/40 bg-rose-soft text-rose line-through decoration-rose/60' : 'border-cyan/30 bg-cyan-soft text-cyan')}>
      <Icon className="size-3.5" />{label}
      {missing && <span className="ml-0.5 no-underline">不存在</span>}
    </span>
  )
}

export function PromptSection() {
  const { soul, update, changed } = useConfig()
  const text = soul.prompt?.system_prompt ?? ''
  const ta = useRef<HTMLTextAreaElement>(null)
  const [menu, setMenu] = useState<{ from: number, slash: boolean } | null>(null)
  const [caret, setCaret] = useState(0)
  const [hi, setHi] = useState(0)
  const [copied, setCopied] = useState(false)

  const items = useMemo(() => referenceables(soul), [soul])
  const filter = menu?.slash ? text.slice(menu.from + 1, caret) : ''
  const shown = items.filter(i => !filter || i.label.toLowerCase().includes(filter.toLowerCase()))

  const refs = useMemo(() => {
    const out: { kind: string, id: string, label: string, missing: boolean }[] = []
    const seen = new Set<string>()
    for (const m of text.matchAll(REF_RE)) {
      const key = `${m[1]}:${m[2]}`
      if (seen.has(key))
        continue
      seen.add(key)
      out.push({ kind: m[1], id: m[2], label: m[3] || m[2], missing: !items.some(i => i.kind === m[1] && i.id === m[2]) })
    }
    return out
  }, [text, items])

  const setText = (v: string) => update(s => ({ ...s, prompt: { ...s.prompt, system_prompt: v } }))

  const insert = (r: RefItem) => {
    if (!menu)
      return
    const end = menu.slash ? caret : menu.from
    const token = refToken(r)
    const next = text.slice(0, menu.from) + token + text.slice(end)
    setText(next)
    setMenu(null)
    const pos = menu.from + token.length
    requestAnimationFrame(() => {
      ta.current?.focus()
      ta.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    const pos = e.target.selectionStart
    setText(v)
    setCaret(pos)
    if (v[pos - 1] === '/' && v.length > text.length && (pos === 1 || /\s/.test(v[pos - 2]))) {
      setMenu({ from: pos - 1, slash: true })
      setHi(0)
    }
    else if (menu?.slash && (pos <= menu.from || /\s/.test(v.slice(menu.from + 1, pos)))) {
      setMenu(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!menu)
      return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setHi(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(shown.length, 1))
    }
    else if (e.key === 'Enter' && shown[hi]) {
      e.preventDefault()
      insert(shown[hi])
    }
    else if (e.key === 'Escape') {
      e.preventDefault()
      setMenu(null)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }
    catch {}
  }

  return (
    <ConfigCard
      id="sec-prompt"
      icon={RiQuillPenLine}
      title="提示词"
      changed={changed.has('prompt')}
      actions={(
        <>
          <span className="mr-1 text-[12px] text-ink-3 tabular-nums">{text.length} 字</span>
          <Button variant="ghost" size="small" onClick={copy}>{copied ? <RiCheckLine className="size-3.5 text-mint" /> : <RiFileCopyLine className="size-3.5" />}复制</Button>
          <Button
            variant="ghost-accent"
            size="small"
            onClick={() => {
              const pos = ta.current?.selectionStart ?? text.length
              setCaret(pos)
              setMenu(m => (m ? null : { from: pos, slash: false }))
              setHi(0)
            }}
          >
            <RiAtLine className="size-3.5" />插入引用
          </Button>
        </>
      )}
    >
      <div className="relative">
        <textarea
          ref={ta}
          value={text}
          rows={9}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onSelect={e => setCaret(e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setMenu(m => (m?.slash ? null : m)), 150)}
          placeholder={'告诉 Agent 它是谁、要做什么、遇到什么情况怎么处理。\n输入 / 引用 Skill、文件、工具或知识检索。'}
          className="block min-h-[180px] w-full resize-y rounded-2xl border border-line bg-hover p-4 font-mono text-[13px] leading-relaxed outline-none transition-[border-color,box-shadow] placeholder:font-sans placeholder:text-ink-3 focus:border-volt focus:shadow-glow-volt"
        />
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
              className="glass-3 absolute inset-x-3 top-[calc(100%-8px)] z-30 max-h-[260px] overflow-auto rounded-2xl p-1.5 shadow-float"
              onMouseDown={e => e.preventDefault()}
            >
              <p className="flex items-center gap-2 px-2.5 pt-1 pb-1.5 text-[11.5px] text-ink-3">
                插入引用{filter && <>：「{filter}」</>}
                <span className="ml-auto flex items-center gap-1"><Kbd>↑↓</Kbd>选择<Kbd>Enter</Kbd>插入<Kbd>Esc</Kbd>关闭</span>
              </p>
              {shown.length === 0 && <p className="px-2.5 py-3 text-[12.5px] text-ink-3">{items.length ? '没有匹配的项' : '还没有可引用的内容，先在下方添加 Skill、文件、工具或知识检索。'}</p>}
              {shown.map((r, i) => {
                const Icon = REF_ICON[r.kind]
                return (
                  <button key={`${r.kind}:${r.id}`} type="button" onMouseEnter={() => setHi(i)} onClick={() => insert(r)} className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13px]', i === hi && 'bg-hover')}>
                    <Icon className="size-4 text-cyan" />
                    <span className="flex-1 truncate">{r.label}</span>
                    <span className="text-[11.5px] text-ink-3">{REF_LABEL[r.kind]}</span>
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {refs.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-ink-3">已引用</span>
          {refs.map(r => <RefChip key={`${r.kind}:${r.id}`} kind={r.kind} label={r.label} missing={r.missing} />)}
        </div>
      )}
    </ConfigCard>
  )
}
