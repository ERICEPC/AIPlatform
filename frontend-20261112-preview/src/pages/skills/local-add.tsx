import type { GithubResolveResult, LocalSkill } from '@/api/skills'
import { RiFileTextLine, RiFolder3Line, RiGithubFill, RiInformationLine, RiLoader4Line, RiUploadCloud2Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { installGithubSkill, resolveGithubSkill, uploadLocalSkill } from '@/api/skills'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form'
import { Badge, Panel } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { errText, fileSize, githubUrlError, itemVariants, Monogram } from './shared'

const ACCEPT = ['.md', '.json', '.zip']
const MAX = 20 * 1024 * 1024
const EXAMPLE = 'https://github.com/OpenSenseNova/SenseNova-Skills/tree/main/skills/sn-search-academic'

function checkFile(f: File) {
  const ext = `.${f.name.split('.').pop()?.toLowerCase()}`
  if (!ACCEPT.includes(ext))
    return `「${f.name}」不是支持的格式，请上传 SKILL.md、.json 或 .zip 技能包`
  if (f.size > MAX)
    return `「${f.name}」超过 20 MB，请精简后再上传`
  if (f.size === 0)
    return `「${f.name}」是空文件`
  return ''
}

/** 两种添加方式并排：上传文件 / 从 GitHub 导入 */
export function AddSkill({ onAdded }: { onAdded: (s: LocalSkill) => void }) {
  return (
    <motion.div variants={itemVariants} className="grid gap-3 lg:grid-cols-2">
      <UploadZone onAdded={onAdded} />
      <GithubImport onAdded={onAdded} />
    </motion.div>
  )
}

function UploadZone({ onAdded }: { onAdded: (s: LocalSkill) => void }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handle = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f || busy)
      return
    const bad = checkFile(f)
    setError(bad)
    if (bad)
      return
    setBusy(f.name)
    try {
      const s = await uploadLocalSkill(f)
      toast(`已添加「${s.name}」 v${s.version}`)
      onAdded(s)
    }
    catch (e) {
      setError(errText(e))
    }
    finally {
      setBusy(null)
      if (input.current)
        input.current.value = ''
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        handle(e.dataTransfer.files)
      }}
      className={cn(
        'glass-2 glass-edge relative flex min-h-[188px] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-line-strong p-6 text-center transition-[border-color,background-color,transform] duration-200',
        over && 'scale-[1.01] border-volt bg-volt-soft',
      )}
    >
      <input ref={input} type="file" accept={ACCEPT.join(',')} className="hidden" onChange={e => handle(e.target.files)} />
      <span className={cn('grid size-12 place-items-center rounded-2xl border border-line bg-glass-3 text-ink-2 transition-colors', over && 'text-volt-text')}>
        {busy ? <RiLoader4Line className="size-5 animate-spin" /> : <RiUploadCloud2Line className="size-5" />}
      </span>
      {busy
        ? <p className="text-[13.5px] text-ink-2">正在解析「{busy}」…</p>
        : (
            <div>
              <p className="text-[14.5px] font-semibold">{over ? '松开即可上传' : '拖入技能文件，或'}<button type="button" onClick={() => input.current?.click()} className="ml-1 cursor-pointer text-volt-text hover:underline">选择文件</button></p>
              <p className="mt-1.5 text-[12.5px] text-ink-3">支持 SKILL.md、.json 描述文件、.zip 技能包（含 SKILL.md 的目录），≤ 20 MB</p>
            </div>
          )}
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-rose">{error}</motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function GithubImport({ onAdded }: { onAdded: (s: LocalSkill) => void }) {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [touched, setTouched] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<GithubResolveResult | null>(null)
  const [installing, setInstalling] = useState(false)
  const formatError = touched ? githubUrlError(url) : ''

  const resolve = async () => {
    setTouched(true)
    if (githubUrlError(url))
      return
    setResolving(true)
    setError('')
    try {
      setPreview(await resolveGithubSkill({ url: url.trim() }))
    }
    catch (e) {
      setError(errText(e))
    }
    finally {
      setResolving(false)
    }
  }

  const install = async () => {
    if (!preview)
      return
    setInstalling(true)
    try {
      const s = await installGithubSkill({ url: preview.url, ref: preview.ref, path: preview.path })
      toast(preview.installed_id ? `已更新「${s.name}」到 v${s.version}` : `已安装「${s.name}」`)
      onAdded(s)
      setPreview(null)
      setUrl('')
      setTouched(false)
    }
    catch (e) {
      setError(errText(e))
      setPreview(null)
    }
    finally {
      setInstalling(false)
    }
  }

  const shownError = formatError || error
  return (
    <Panel level={2} className="flex min-h-[188px] flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl border border-line bg-glass-3"><RiGithubFill className="size-[18px]" /></span>
        <div>
          <p className="text-[14.5px] font-semibold">从 GitHub 导入</p>
          <p className="text-[12.5px] text-ink-3">粘贴仓库或技能目录地址，目录里需要有 SKILL.md</p>
        </div>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          resolve()
        }}
      >
        <Input
          value={url}
          invalid={!!shownError}
          onChange={(e) => {
            setUrl(e.target.value)
            setError('')
          }}
          onBlur={() => url && setTouched(true)}
          placeholder="https://github.com/owner/repo/tree/main/skills/xxx"
          className="font-mono text-[13px]"
          aria-label="GitHub 地址"
        />
        <Button type="submit" variant="primary" size="large" loading={resolving} className="shrink-0">解析</Button>
      </form>
      <div className="mt-2 min-h-[20px] text-[12.5px]">
        {shownError
          ? <p className="text-rose">{shownError}</p>
          : (
              <p className="text-ink-3">
                示例：
                <button type="button" onClick={() => setUrl(EXAMPLE)} className="cursor-pointer font-mono text-ink-2 hover:text-volt-text hover:underline">…/SenseNova-Skills/tree/main/skills/sn-search-academic</button>
              </p>
            )}
      </div>
      <p className="mt-auto flex items-start gap-1.5 pt-2 text-[12px] text-ink-3"><RiInformationLine className="mt-0.5 size-3.5 shrink-0" />只读取公开仓库；安装后可在列表里一键拉取更新。</p>

      <GithubPreviewDialog preview={preview} installing={installing} onClose={() => setPreview(null)} onInstall={install} />
    </Panel>
  )
}

function GithubPreviewDialog({ preview: p, installing, onClose, onInstall }: { preview: GithubResolveResult | null, installing: boolean, onClose: () => void, onInstall: () => void }) {
  return (
    <Dialog
      open={!!p}
      onOpenChange={o => !o && onClose()}
      title="确认安装技能"
      description="已读取 SKILL.md，确认信息无误后安装到本地。"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={installing} onClick={onInstall}>{p?.installed_id ? '更新到此版本' : '安装'}</Button>
        </>
      )}
    >
      {p && (
        <div className="space-y-4 text-[13.5px]">
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-hover p-4">
            <Monogram name={p.name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[14.5px] font-semibold">{p.name}</p>
                <Badge>v{p.version}</Badge>
              </div>
              <p className="mt-1.5 leading-relaxed text-ink-2">{p.description}</p>
            </div>
          </div>
          {p.installed_id && <p className="rounded-xl bg-amber-soft px-3.5 py-2 text-[12.5px] text-amber">本地已安装同名技能，安装会覆盖为这个版本，启用状态保持不变。</p>}
          <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-ink-3">仓库</dt><dd className="truncate font-mono">{p.owner}/{p.repo}</dd>
            <dt className="text-ink-3">分支</dt><dd className="font-mono">{p.ref}</dd>
            <dt className="text-ink-3">目录</dt><dd className="truncate font-mono">{p.path || '（仓库根目录）'}</dd>
          </dl>
          <div>
            <p className="mb-2 text-[13px] font-semibold">文件 <span className="font-normal text-ink-3">{p.files.length}</span></p>
            <FileList files={p.files} />
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function FileList({ files }: { files: { path: string, size: number }[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {files.map(f => (
        <li key={f.path} className="flex items-center gap-2.5 px-3.5 py-2 text-[12.5px]">
          {f.path.includes('/') ? <RiFolder3Line className="size-4 text-ink-3" /> : <RiFileTextLine className={cn('size-4', f.path === 'SKILL.md' ? 'text-volt-text' : 'text-ink-3')} />}
          <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
          <span className="text-ink-3 tabular-nums">{fileSize(f.size)}</span>
        </li>
      ))}
    </ul>
  )
}
