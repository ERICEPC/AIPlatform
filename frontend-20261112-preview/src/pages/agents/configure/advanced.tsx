import type { EnvVariable } from '@/api/agents'
import { RiDeleteBinLine, RiEyeLine, RiEyeOffLine, RiFileUploadLine, RiSettings3Line } from '@remixicon/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { AddButton, ConfigCard, IconBtn } from '../shared'
import { useConfig } from './context'

/** 解析 .env：KEY=VALUE，忽略注释和空行，去掉成对引号 */
function parseEnv(text: string): EnvVariable[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('=')).map((l) => {
    const i = l.indexOf('=')
    const key = l.slice(0, i).replace(/^export\s+/, '').trim()
    const value = l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    return { key, value }
  })
}

const cell = 'h-9 w-full rounded-xl border border-transparent bg-transparent px-2.5 font-mono text-[12.5px] outline-none transition-colors hover:border-line focus:border-volt focus:bg-hover'

export function AdvancedSection() {
  const { soul, update, changed } = useConfig()
  const toast = useToast()
  const vars = soul.env?.variables ?? []
  const [shown, setShown] = useState<Set<number>>(new Set())
  const file = useRef<HTMLInputElement>(null)
  const setVars = (fn: (l: EnvVariable[]) => EnvVariable[]) => update(s => ({ ...s, env: { ...s.env, variables: fn(s.env?.variables ?? []) } }))
  const dup = new Set(vars.map(v => v.key).filter((k, i, a) => k && a.indexOf(k) !== i))

  const importEnv = async (f: File) => {
    const parsed = parseEnv(await f.text())
    if (!parsed.length) {
      toast('文件里没有可识别的 KEY=VALUE', 'info')
      return
    }
    setVars((l) => {
      const map = new Map(l.map(v => [v.key, v]))
      parsed.forEach(p => map.set(p.key, { ...map.get(p.key), ...p }))
      return [...map.values()]
    })
    toast(`已导入 ${parsed.length} 个变量`)
  }

  return (
    <ConfigCard
      id="sec-advanced"
      icon={RiSettings3Line}
      title="高级 · 环境变量"
      count={vars.length}
      changed={changed.has('env')}
      hint="工具、CLI 和 Skill 脚本运行时可读取。密钥类变量默认隐藏。"
      actions={(
        <>
          <Button variant="ghost" size="small" onClick={() => file.current?.click()}><RiFileUploadLine className="size-3.5" />导入 .env</Button>
          <AddButton onClick={() => setVars(l => [...l, { key: '', value: '' }])} />
          <input ref={file} type="file" accept=".env,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importEnv(f); e.target.value = '' }} />
        </>
      )}
    >
      {vars.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_64px] gap-2 border-b border-line bg-hover px-3 py-2 text-[12px] text-ink-3"><span>变量名</span><span>值</span><span /></div>
          {vars.map((v, i) => {
            const visible = shown.has(i)
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_64px] items-center gap-2 border-b border-line px-1.5 py-1 last:border-b-0">
                <input aria-label="变量名" value={v.key} placeholder="KEY" onChange={e => setVars(l => l.map((x, j) => (j === i ? { ...x, key: e.target.value.replace(/\s/g, '') } : x)))} className={cn(cell, dup.has(v.key) && 'border-rose text-rose')} title={dup.has(v.key) ? '变量名重复' : undefined} />
                <input aria-label="值" type={visible ? 'text' : 'password'} value={String(v.value ?? '')} placeholder="value" onChange={e => setVars(l => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={cell} />
                <div className="flex justify-end">
                  <IconBtn label={visible ? '隐藏' : '显示'} onClick={() => setShown((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })}>{visible ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}</IconBtn>
                  <IconBtn label="删除" danger onClick={() => setVars(l => l.filter((_, j) => j !== i))}><RiDeleteBinLine className="size-4" /></IconBtn>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ConfigCard>
  )
}
