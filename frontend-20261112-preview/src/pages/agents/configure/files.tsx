import type { ConfigFileKbLink, ConfigFilePreview, ConfigFileRef } from '@/api/agents'
import type { KbLibrary } from '@/api/knowledge'
import { RiDeleteBinLine, RiDownload2Line, RiFileTextLine, RiFolderOpenLine, RiInboxArchiveLine, RiSparkling2Line, RiUpload2Line } from '@remixicon/react'
import { useEffect, useRef, useState } from 'react'
import { addConfigFile, deleteConfigFile, downloadConfigFile, previewConfigFile, saveConfigFileToKb, uploadFile } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { AddButton, ConfigCard, errText, fileSize, IconBtn, openUrl, Row } from '../shared'
import { useConfig } from './context'
import { KbPickerDialog } from './kb-picker'

const BUILD_NOTE = 'build_note.md'

export function FilesSection(_props: { go: (path: string) => void }) {
  const { agentId, soul, changed, flush, reload, update } = useConfig()
  const toast = useToast()
  const files = soul.config_files ?? []
  const links = soul.config_files_kb ?? []
  const [saveTarget, setSaveTarget] = useState<ConfigFileRef | null>(null)

  /* 关联知识库：写入 agent_soul.config_files_kb，走自动保存 */
  const setLinks = (fn: (l: ConfigFileKbLink[]) => ConfigFileKbLink[]) => update(s => ({ ...s, config_files_kb: fn(s.config_files_kb ?? []) }))
  const saveToKb = async (f: ConfigFileRef, lib: KbLibrary) => {
    try {
      await flush()
      await saveConfigFileToKb(agentId, f.name, lib.id, lib.baseName)
      await reload()
      // 存入的子库自动加入关联，方便在本分区看到文件去向
      if (!links.some(x => x.knowledge_base_id === lib.id))
        setLinks(list => [...list, { knowledge_base_id: lib.id, name: lib.baseName }])
      toast(`已把「${f.name}」存入「${lib.baseName}」`)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<ConfigFileRef | null>(null)

  const upload = async (list: FileList) => {
    setBusy(true)
    try {
      await flush()
      for (const f of Array.from(list)) {
        const up = await uploadFile(f)
        await addConfigFile(agentId, up.id)
      }
      await reload()
      toast(list.length > 1 ? `已上传 ${list.length} 个文件` : `已上传「${list[0].name}」`)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }
  const remove = async (f: ConfigFileRef) => {
    try {
      await flush()
      await deleteConfigFile(agentId, f.name)
      await reload()
      toast(`已删除「${f.name}」`)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }
  const download = async (f: ConfigFileRef) => {
    try {
      openUrl((await downloadConfigFile(agentId, f.name)).url)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }

  return (
    <ConfigCard
      id="sec-files"
      icon={RiFolderOpenLine}
      title="文件"
      count={files.length}
      changed={changed.has('config_files')}
      hint={files.length ? undefined : '上传规范、模板、参考资料等文件，Agent 运行时可以直接读取。'}
      actions={(
        <>
          <AddButton loading={busy} onClick={() => input.current?.click()}><RiUpload2Line className="size-3.5" />上传</AddButton>
          <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
        </>
      )}
    >
      {files.length > 0 && (
        <div
          className="space-y-0.5"
          onDragOver={e => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files.length)
              upload(e.dataTransfer.files)
          }}
        >
          {files.map((f) => {
            const note = f.name === BUILD_NOTE || f.generated
            return (
              <Row
                key={f.name}
                tone={f.is_missing ? 'warn' : undefined}
                onClick={() => setView(f)}
                icon={note ? <RiSparkling2Line className="size-4 text-cyan" /> : <RiFileTextLine className="size-4 text-ink-2" />}
                title={<span className="flex items-center gap-2">{f.name}{note && <Badge tone="cyan">已生成</Badge>}{f.is_missing && <Badge tone="rose">不存在</Badge>}</span>}
                sub={note ? '构建对话自动生成的设计说明' : [fileSize(f.size), f.knowledge_base_name && `已存入「${f.knowledge_base_name}」`].filter(Boolean).join(' · ')}
                right={(
                  <>
                    {!note && !f.is_missing && <IconBtn label={f.knowledge_base_id ? '改存到其他知识库' : '存入知识库'} onClick={() => setSaveTarget(f)}><RiInboxArchiveLine className="size-4" /></IconBtn>}
                    <IconBtn label="下载" onClick={() => download(f)}><RiDownload2Line className="size-4" /></IconBtn>
                    {!note && <IconBtn label="删除" danger onClick={() => remove(f)}><RiDeleteBinLine className="size-4" /></IconBtn>}
                  </>
                )}
              />
            )
          })}
        </div>
      )}
      <FileDrawer file={view} onClose={() => setView(null)} onDownload={download} />
      <KbPickerDialog
        open={!!saveTarget}
        title={`把「${saveTarget?.name ?? ''}」存入知识库`}
        description="选择一个子库，文件会作为材料加入该知识库，处理完成后同事也能检索到。"
        value={saveTarget?.knowledge_base_id ? [saveTarget.knowledge_base_id] : []}
        onClose={() => setSaveTarget(null)}
        onConfirm={([lib]) => saveTarget && lib && saveToKb(saveTarget, lib)}
      />
    </ConfigCard>
  )
}

function FileDrawer({ file, onClose, onDownload }: { file: ConfigFileRef | null, onClose: () => void, onDownload: (f: ConfigFileRef) => void }) {
  const { agentId } = useConfig()
  const [data, setData] = useState<ConfigFilePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!file)
      return
    setData(null)
    setError(null)
    previewConfigFile(agentId, file.name).then(setData).catch(e => setError(errText(e)))
  }, [agentId, file])
  return (
    <Drawer
      open={!!file}
      onClose={onClose}
      title={<div><p className="text-[17px] font-semibold">{file?.name}</p><p className="mt-1 text-[12.5px] text-ink-3">{fileSize(data?.size ?? file?.size)}</p></div>}
      footer={file && <Button variant="secondary" onClick={() => onDownload(file)}><RiDownload2Line className="size-4" />下载</Button>}
    >
      {error && <p className="text-[13px] text-rose">{error}</p>}
      {!data && !error && <Skeleton className="h-64 rounded-2xl" />}
      {data?.binary && <p className="rounded-2xl border border-line p-6 text-center text-[13px] text-ink-3">这是二进制文件，无法预览，请下载后查看。</p>}
      {data && !data.binary && (
        <pre className="overflow-auto rounded-2xl border border-line bg-hover p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{data.text}{data.truncated && '\n…（内容过长，已截断）'}</pre>
      )}
    </Drawer>
  )
}
