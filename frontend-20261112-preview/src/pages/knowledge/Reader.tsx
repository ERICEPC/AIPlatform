import type { Go } from './shared'
import { RiArrowLeftLine, RiChat3Line, RiDownload2Line, RiFileUnknowLine, RiListUnordered } from '@remixicon/react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { downloadMaterialOriginal, downloadMaterialRendition, getDocumentPolicy, queryDocumentDetail, queryMaterialPreview } from '@/api/knowledge'
import { Page, Rise, Toolbar } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Badge, EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { Markdown, parseMarkdown } from './Markdown'
import { CoverPlaceholder, FileGlyph, fmtTime, isReady, presentation, saveBlob, useHashQuery } from './shared'

/** 阅读器：整页阅读一份材料，左侧目录（有标题时），顶栏返回 / 问一问 / 下载 */
export function Reader({ libraryId, go }: { libraryId: string, go: Go }) {
  const docId = useHashQuery().get('doc') ?? ''
  const toast = useToast()
  const detail = useQuery(() => queryDocumentDetail(docId), [docId], { enabled: !!docId })
  const preview = useQuery(() => queryMaterialPreview(docId), [docId], { enabled: !!docId, pollMs: 4000 })
  const policy = useQuery(() => getDocumentPolicy(docId), [docId], { enabled: !!docId })
  const md = useMemo(() => (preview.data?.kind === 'MARKDOWN' ? parseMarkdown(preview.data.content) : null), [preview.data])
  const [binaryUrl, setBinaryUrl] = useState('')
  const [binaryError, setBinaryError] = useState<Error | null>(null)
  const [binaryLoading, setBinaryLoading] = useState(false)
  useEffect(() => {
    let disposed = false
    let url = ''
    setBinaryUrl(''); setBinaryError(null); setBinaryLoading(false)
    const type = preview.data?.contentType ?? ''
    const supported = type === 'application/pdf' || type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')
    if (preview.data?.status === 'READY' && supported) {
      setBinaryLoading(true)
      const task = preview.data.contentSource === 'RENDITION'
        ? downloadMaterialRendition(docId, preview.data.version)
        : downloadMaterialOriginal(docId, preview.data.version)
      task.then(blob => {
        if (disposed) return
        setBinaryLoading(false)
        url = URL.createObjectURL(new Blob([blob], { type })); setBinaryUrl(url)
      }).catch(e => { if (!disposed) { setBinaryLoading(false); setBinaryError(e) } })
    }
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [docId, preview.data?.version, preview.data?.contentType, preview.data?.contentSource, preview.data?.status])
  const [activeH, setActiveH] = useState('')
  const [downloading, setDownloading] = useState(false)
  const m = detail.data
  const p = m ? presentation(m) : null
  const back = () => go(`kb${libraryId ? `/${libraryId}` : ''}${docId ? `?doc=${encodeURIComponent(docId)}` : ''}`)

  // 目录高亮：滚动时找到最靠上的可见标题
  useEffect(() => {
    if (!md?.outline.length)
      return
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (top)
        setActiveH(top.target.id)
    }, { rootMargin: '-80px 0px -60% 0px' })
    md.outline.forEach(o => document.getElementById(o.id) && io.observe(document.getElementById(o.id)!))
    return () => io.disconnect()
  }, [md])

  const download = async () => {
    if (!preview.data)
      return
    setDownloading(true)
    try {
      saveBlob(await downloadMaterialOriginal(docId, preview.data.version), m?.originalFileName ?? '材料')
      toast('已开始下载原件')
    }
    catch (e) {
      toast((e as Error).message || '下载失败，请稍后重试', 'info')
    }
    finally {
      setDownloading(false)
    }
  }

  if (!docId) {
    return (
      <Page className="items-center justify-center">
        <EmptyState icon={<RiFileUnknowLine className="size-5" />} title="没有指定要阅读的材料" hint="从材料列表打开「阅读全文」。" action={<Button variant="secondary" onClick={() => go('kb')}>返回材料列表</Button>} />
      </Page>
    )
  }

  return (
    <Page>
      <Toolbar>
        <Button variant="ghost" size="icon" aria-label="返回材料列表" onClick={back}><RiArrowLeftLine className="size-[18px]" /></Button>
        {p ? <FileGlyph format={p.format} size={34} /> : <Skeleton className="size-[34px] rounded-xl" />}
        <div className="min-w-0 leading-tight">
          {p ? <p className="truncate text-[15px] font-semibold">{p.title}</p> : <Skeleton className="h-4 w-48" />}
          <p className="mt-0.5 truncate text-[12px] text-ink-3">{m ? `${p!.format} · ${m.knowledgeBaseName} · 更新于 ${fmtTime(m.editTime)}` : ' '}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {p?.usageScopes.map(s => <Badge key={s} tone={s === '可对客' ? 'mint' : s === '仅内部' ? 'amber' : 'cyan'}>{s}</Badge>)}
          <Button variant="ghost" loading={downloading} disabled={!policy.data?.permissions?.includes('DOWNLOAD') || !preview.data} onClick={download}><RiDownload2Line className="size-4" />下载</Button>
          <Button variant="primary" disabled={!m || !isReady(m)} onClick={() => go(`kb/ask?doc=${encodeURIComponent(docId)}`)}><RiChat3Line className="size-4" />问这份材料</Button>
        </div>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-y-auto pt-16">
        <div className="flex min-h-[calc(100vh-150px)] w-full gap-6 px-6 pt-6 pb-6">
          {md && md.outline.length > 1 && (
            <nav aria-label="目录" className="sticky top-6 hidden h-fit w-[220px] shrink-0 lg:block">
              <p className="mb-2 flex items-center gap-1.5 px-3 text-[12px] font-medium text-ink-3"><RiListUnordered className="size-3.5" />目录</p>
              <ul className="space-y-0.5 border-l border-line">
                {md.outline.map(o => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => document.getElementById(o.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className={cn(
                        '-ml-px block w-full cursor-pointer truncate border-l-2 py-1.5 pr-2 text-left text-[12.5px] transition-colors',
                        o.level <= 1 ? 'pl-3' : o.level === 2 ? 'pl-5' : 'pl-7',
                        activeH === o.id ? 'border-volt font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                      )}
                    >
                      {o.text}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <Rise className="min-h-0 min-w-0 flex-1">
            {detail.error || preview.error
              ? <ErrorBar error={detail.error ?? preview.error} onRetry={() => { detail.reload(); preview.reload() }} />
              : preview.loading || detail.loading
                ? <Panel level={2} className="space-y-4 p-10">{[80, 100, 92, 70, 96, 60].map((w, i) => <div key={i} style={{ width: `${w}%` }}><Skeleton className="h-4" /></div>)}</Panel>
                : binaryUrl
                  ? preview.data?.contentType === 'application/pdf' ? <iframe title="材料 PDF 预览" src={binaryUrl} className="h-[calc(100vh-170px)] min-h-[620px] w-full rounded-2xl border border-line" /> : preview.data?.contentType.startsWith('video/') ? <video controls playsInline preload="metadata" src={binaryUrl} className="h-[calc(100vh-170px)] min-h-[420px] w-full rounded-2xl border border-line bg-black object-contain" /> : preview.data?.contentType.startsWith('audio/') ? <audio controls preload="metadata" src={binaryUrl} className="mx-auto mt-20 w-full" /> : <img src={binaryUrl} alt={p?.title ?? '材料预览'} className="h-[calc(100vh-170px)] max-h-[calc(100vh-170px)] w-full rounded-2xl object-contain" />
                  : binaryError ? <ErrorBar error={binaryError} />
                  : binaryLoading ? <div className="flex min-h-[calc(100vh-170px)] w-full items-center justify-center rounded-2xl border border-line text-ink-3">正在加载预览…</div>
                  : preview.data?.kind === 'TEXT' ? <pre className="whitespace-pre-wrap rounded-2xl border border-line p-8">{preview.data.content}</pre>
                  : md
                  ? (
                      <Panel level={2} radius="xl" className="mx-auto max-w-[780px] px-12 py-10">
                        <Markdown blocks={md.blocks} />
                        {preview.data?.truncated && <p className="mt-6 text-[12.5px] text-ink-3">内容较长，这里只显示前一部分；完整内容请下载原件。</p>}
                      </Panel>
                    )
                  : (
                      <div className="mx-auto max-w-[780px] space-y-3">
                        <CoverPlaceholder format={p?.format ?? '文件'} title={preview.data?.status === 'CONVERTING' ? '材料还在处理，稍后可在线阅读' : p?.title ?? ''} className="aspect-[16/10] w-full" />
                        <p className="text-center text-[12.5px] text-ink-3">{preview.data?.kind === 'IMAGE' ? '图片原件需在完整知识库中查看，或直接下载。' : '这种格式暂不支持在线阅读，可以下载原件查看。'}</p>
                      </div>
                    )}
          </Rise>
        </div>
      </div>
    </Page>
  )
}
