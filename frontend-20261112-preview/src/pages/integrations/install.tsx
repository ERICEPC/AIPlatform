/* 「安装」菜单：从插件市场 / 从 GitHub（分步）/ 本地插件包（拖放） */
import type { PluginCategory, UploadResponse } from '@/api/integrations'
import { RiArrowDownSLine, RiCheckLine, RiDownloadLine, RiFileZipLine, RiGithubFill, RiStore2Line, RiUploadCloud2Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { installFromGithub, installFromPackage, tr, uploadGithub, uploadPackage } from '@/api/integrations'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Menu } from '@/components/ui/menu'
import { Badge } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { authorName, PluginTile, useIntegrations } from './kit'

const categoryLabel: Record<PluginCategory, string> = { 'model': '模型', 'tool': '工具', 'datasource': '数据来源', 'trigger': '触发器', 'agent-strategy': 'Agent 策略', 'extension': '扩展' }

/** 解析结果预览 */
function ManifestCard({ data }: { data: UploadResponse }) {
  const m = data.manifest
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-hover p-3.5">
      <PluginTile icon={m.icon} size={42} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">{tr(m.label)}<Badge className="h-5 px-2 text-[11px]">{categoryLabel[m.category]}</Badge></p>
        <p className="truncate text-[12.5px] text-ink-3">{authorName(m.author)} · v{m.version} · {tr(m.description)}</p>
      </div>
    </div>
  )
}

/* ---------------- GitHub 分步安装 ---------------- */
const steps = ['仓库地址', '选择版本', '选择插件包', '确认安装'] as const
// 演示用的 Release 列表；live 模式下由 GitHub API 返回（原实现在前端直接请求 api.github.com）
const fakeReleases = [{ tag: 'v0.3.1', assets: ['plugin-0.3.1.difypkg', 'plugin-0.3.1-linux.difypkg'] }, { tag: 'v0.3.0', assets: ['plugin-0.3.0.difypkg'] }, { tag: 'v0.2.4', assets: ['plugin-0.2.4.difypkg'] }]
const assetLabel = (a: string) => a.replace(/\.difypkg$/i, '（插件包）').replace(/\.difybndl$/i, '（插件集合包）')

function GithubDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { watchTasks } = useIntegrations()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [repo, setRepo] = useState('')
  const [version, setVersion] = useState('')
  const [pkg, setPkg] = useState('')
  const [parsed, setParsed] = useState<UploadResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const repoOk = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repo.trim())
  const release = fakeReleases.find(r => r.tag === version)

  const reset = () => {
    setStep(0); setRepo(''); setVersion(''); setPkg(''); setParsed(null); setError(null)
  }
  const close = () => {
    onClose()
    setTimeout(reset, 250)
  }
  const next = async () => {
    setError(null)
    if (step === 2) {
      setBusy(true)
      try {
        setParsed(await uploadGithub({ repo: repo.trim().replace(/\/$/, ''), version, package: pkg }))
        setStep(3)
      }
      catch (e) {
        setError(e as Error)
      }
      finally {
        setBusy(false)
      }
      return
    }
    if (step === 3 && parsed) {
      setBusy(true)
      try {
        await installFromGithub({ repo: repo.trim(), version, package: pkg, plugin_unique_identifier: parsed.unique_identifier })
        watchTasks()
        toast(`开始安装 ${tr(parsed.manifest.label)}`)
        close()
      }
      catch (e) {
        setError(e as Error)
      }
      finally {
        setBusy(false)
      }
      return
    }
    setStep(s => s + 1)
  }
  const canNext = [repoOk, !!version, !!pkg, !!parsed][step]

  return (
    <Dialog
      open={open}
      onOpenChange={o => !o && close()}
      title="从 GitHub 安装"
      description="从公开仓库的 Release 里选择插件包安装。"
      footer={(
        <>
          {step > 0 && <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={busy}>上一步</Button>}
          <Button variant="primary" disabled={!canNext} loading={busy} onClick={next}>{step === 3 ? '安装' : step === 2 ? '解析插件包' : '下一步'}</Button>
        </>
      )}
    >
      <ol className="mb-5 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold transition-colors', i < step ? 'bg-volt text-volt-ink' : i === step ? 'bg-volt-soft text-volt-text ring-1 ring-volt' : 'bg-hover text-ink-3')}>
              {i < step ? <RiCheckLine className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-[12.5px] whitespace-nowrap', i === step ? 'font-medium text-ink' : 'text-ink-3')}>{s}</span>
            {i < steps.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-volt' : 'bg-line')} />}
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-4">
          {step === 0 && (
            <Field label="仓库地址" required error={repo && !repoOk ? '格式应为 https://github.com/owner/repo' : undefined} hint="仓库需公开，且 Release 里附带插件包文件。">
              <Input autoFocus value={repo} onChange={e => setRepo(e.target.value)} placeholder="https://github.com/sensetime-raccoon/wecom-plugin" invalid={!!repo && !repoOk} />
            </Field>
          )}
          {step === 1 && (
            <Field label="版本" required hint={repo}>
              <Select value={version} onValueChange={(v) => { setVersion(v); setPkg('') }} options={fakeReleases.map((r, i) => ({ value: r.tag, label: r.tag, hint: i === 0 ? '最新' : undefined }))} placeholder="选择一个 Release" />
            </Field>
          )}
          {step === 2 && (
            <Field label="插件包" required hint={`${repo} · ${version}`}>
              <Select value={pkg} onValueChange={setPkg} options={(release?.assets ?? []).map(a => ({ value: a, label: assetLabel(a) }))} placeholder="选择要安装的文件" />
            </Field>
          )}
          {step === 3 && parsed && (
            <>
              <ManifestCard data={parsed} />
              <p className="text-[12.5px] text-ink-3">来自 GitHub 的插件未经插件市场审核，请确认来源可信。安装进度会显示在右上角的任务里。</p>
            </>
          )}
          <ErrorBar error={error} />
        </motion.div>
      </AnimatePresence>
    </Dialog>
  )
}

/* ---------------- 本地插件包 ---------------- */
function PackageDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { watchTasks } = useIntegrations()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<UploadResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const close = () => {
    onClose()
    setTimeout(() => { setFile(null); setParsed(null); setError(null) }, 250)
  }
  const pick = async (f: File | undefined) => {
    if (!f)
      return
    if (!/\.(difypkg|difybndl)$/i.test(f.name)) {
      setError(new Error('只支持插件包或插件集合包文件，请从插件作者处获取正确的安装包'))
      return
    }
    setFile(f)
    setParsed(null)
    setError(null)
    setBusy(true)
    try {
      setParsed(await uploadPackage(f))
    }
    catch (e) {
      setError(e as Error)
    }
    finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={o => !o && close()}
      title="安装本地插件包"
      description="上传从插件作者处获得的插件包或插件集合包。"
      footer={(
        <>
          <Button variant="ghost" onClick={close}>取消</Button>
          <Button
            variant="primary"
            disabled={!parsed}
            loading={busy && !!parsed}
            onClick={async () => {
              setBusy(true)
              try {
                await installFromPackage([parsed!.unique_identifier])
                watchTasks()
                toast(`开始安装 ${tr(parsed!.manifest.label)}`)
                close()
              }
              catch (e) {
                setError(e as Error)
              }
              finally {
                setBusy(false)
              }
            }}
          >
            安装
          </Button>
        </>
      )}
    >
      <input ref={input} type="file" accept=".difypkg,.difybndl" hidden onChange={e => pick(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
        className={cn('flex w-full cursor-pointer flex-col items-center gap-2 rounded-[22px] border-2 border-dashed px-6 py-10 text-center transition-colors', drag ? 'border-volt bg-volt-soft' : 'border-line-strong hover:border-ink-3 hover:bg-hover')}
      >
        <span className={cn('grid size-12 place-items-center rounded-2xl', drag ? 'bg-volt text-volt-ink' : 'bg-hover text-ink-2')}>
          {file ? <RiFileZipLine className="size-6" /> : <RiUploadCloud2Line className="size-6" />}
        </span>
        <span className="text-[14px] font-medium">{file ? file.name : '拖放文件到这里，或点击选择'}</span>
        <span className="text-[12px] text-ink-3">{file ? `${(file.size / 1024).toFixed(1)} KB · ${busy && !parsed ? '正在解析…' : '点击可更换'}` : '支持插件包、插件集合包，单个文件不超过 50 MB'}</span>
      </button>
      {parsed && <div className="mt-4"><ManifestCard data={parsed} /></div>}
      {error && <div className="mt-4"><ErrorBar error={error} /></div>}
    </Dialog>
  )
}

export function InstallMenu() {
  const { openMarketplace } = useIntegrations()
  const [dlg, setDlg] = useState<'github' | 'pkg' | null>(null)
  return (
    <>
      <Menu
        items={[
          { label: '从插件市场', icon: RiStore2Line, onSelect: () => openMarketplace('tool') },
          { label: '从 GitHub', icon: RiGithubFill, onSelect: () => setDlg('github') },
          { label: '本地插件包', icon: RiFileZipLine, onSelect: () => setDlg('pkg') },
        ]}
        trigger={<Button variant="primary" size="medium"><RiDownloadLine className="size-4" />安装<RiArrowDownSLine className="-mr-1 size-4" /></Button>}
      />
      <GithubDialog open={dlg === 'github'} onClose={() => setDlg(null)} />
      <PackageDialog open={dlg === 'pkg'} onClose={() => setDlg(null)} />
    </>
  )
}
