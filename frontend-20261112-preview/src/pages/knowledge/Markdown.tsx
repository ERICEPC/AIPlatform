import { cn } from '@/lib/cn'

/*
  轻量 Markdown 渲染（预览 / 阅读器用）：标题、段落、列表、引用、表格、代码块、**粗体**、`代码`。
  不引入依赖；不渲染 HTML，避免把材料里的脚本带进页面。
*/
type Block =
  | { t: 'h', level: number, text: string, id: string }
  | { t: 'p', text: string }
  | { t: 'quote', text: string }
  | { t: 'ul' | 'ol', items: string[] }
  | { t: 'table', head: string[], rows: string[][] }
  | { t: 'code', text: string }

export type OutlineItem = { id: string, level: number, text: string }

export function parseMarkdown(src: string): { blocks: Block[], outline: OutlineItem[] } {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  const outline: OutlineItem[] = []
  let i = 0
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      blocks.push({ t: 'code', text: buf.join('\n') })
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const id = `md-h-${outline.length}`
      blocks.push({ t: 'h', level: h[1].length, text: h[2], id })
      outline.push({ id, level: h[1].length, text: h[2] })
      i++
      continue
    }
    if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      blocks.push({ t: 'table', head, rows })
      continue
    }
    if (line.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ t: 'quote', text: buf.join(' ') })
      continue
    }
    const list = /^(\s*)([-*]|\d+\.)\s+/.exec(line)
    if (list) {
      const ordered = /\d/.test(list[2])
      const items: string[] = []
      while (i < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^(\s*)([-*]|\d+\.)\s+/, ''))
      blocks.push({ t: ordered ? 'ol' : 'ul', items })
      continue
    }
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#|>|```|\||\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) buf.push(lines[i++])
    if (!buf.length)
      buf.push(lines[i++])
    blocks.push({ t: 'p', text: buf.join(' ') })
  }
  return { blocks, outline }
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\((?:https?:\/\/|\/)[^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
        ? <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>
        : p.startsWith('`') && p.endsWith('`')
          ? <code key={i} className="rounded-md bg-press px-1.5 py-0.5 font-mono text-[0.9em]">{p.slice(1, -1)}</code>
          : /^\[[^\]]+\]\((?:https?:\/\/|\/)[^\s)]+\)$/.test(p)
            ? <a key={i} href={p.slice(p.indexOf('](') + 2, -1)} target="_blank" rel="noopener noreferrer" className="break-all text-cyan underline underline-offset-2">{p.slice(1, p.indexOf(']('))}</a>
            : <span key={i}>{p}</span>)}
    </>
  )
}

export function Markdown({ blocks, size = 'md', className }: { blocks: Block[], size?: 'sm' | 'md', className?: string }) {
  const body = size === 'sm' ? 'text-[13px] leading-relaxed' : 'text-[15px] leading-[1.85]'
  return (
    <div className={cn('space-y-3 text-ink-2', body, className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const cls = b.level === 1
              ? (size === 'sm' ? 'text-[16px]' : 'text-[26px] tracking-[-0.02em]')
              : b.level === 2 ? (size === 'sm' ? 'pt-1 text-[14px]' : 'pt-4 text-[19px]') : 'text-[15px]'
            return <p key={i} id={b.id} role="heading" aria-level={b.level} className={cn('scroll-mt-24 font-semibold text-ink', cls)}><Inline text={b.text} /></p>
          }
          case 'quote':
            return <blockquote key={i} className="rounded-r-xl border-l-2 border-cyan bg-cyan-soft px-4 py-2.5 text-ink"><Inline text={b.text} /></blockquote>
          case 'ul':
          case 'ol': {
            const Tag = b.t
            return (
              <Tag key={i} className={cn('space-y-1.5 pl-5', b.t === 'ul' ? 'list-disc marker:text-volt-text' : 'list-decimal marker:text-ink-3')}>
                {b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}
              </Tag>
            )
          }
          case 'table':
            return (
              <div key={i} className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-hover text-[0.86em] text-ink-3">
                    <tr>{b.head.map((c, j) => <th key={j} className="px-4 py-2 font-medium">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => <tr key={j} className="border-t border-line">{r.map((c, k) => <td key={k} className={cn('px-4 py-2', k === 0 && 'text-ink')}><Inline text={c} /></td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            )
          case 'code':
            return <pre key={i} className="overflow-x-auto rounded-2xl bg-press p-4 font-mono text-[0.86em] text-ink">{b.text}</pre>
          default:
            return <p key={i}><Inline text={b.text} /></p>
        }
      })}
    </div>
  )
}
