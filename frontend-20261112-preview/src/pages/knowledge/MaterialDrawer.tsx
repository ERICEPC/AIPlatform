import { API_MODE } from '@/api/http'
import type { KbMaterial } from '@/api/knowledge'
import { RiBookOpenLine, RiChat3Line, RiDownload2Line, RiErrorWarningLine, RiFileList3Line, RiLock2Line, RiShareForwardLine } from '@remixicon/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { downloadMaterialOriginal, downloadMaterialRendition, getDocumentPolicy, listMaterialVersions, queryDocumentDetail, queryMaterialOverview, queryMaterialPreview } from '@/api/knowledge'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { Markdown, parseMarkdown } from './Markdown'
import { ScopeBadge, StatusBadge } from './MaterialTable'
import { CoverPlaceholder, fmtSize, fmtTime, isReady, presentation, saveBlob } from './shared'

const ACCESS_LABEL = { PRIVATE: '仅自己', INHERIT: '按知识库权限', TENANT: '公司可见', CUSTOM: '指定共享' }
const PERMISSION_LABEL = { READ: '查看', CONTRIBUTE: '更新内容', SHARE: '设置共享', MANAGE: '管理材料', DOWNLOAD: '下载与导出' }

type Actions = { onAsk: (m: KbMaterial) => void, onShare: (m: KbMaterial) => void, onRead: (m: KbMaterial) => void }

/** 右侧抽屉「材料详情」：预览、概览、来源备注、权限与版本、文件信息 */
export function MaterialDrawer({ id, onClose, ...actions }: { id: string | null, onClose: () => void } & Actions) {
  // 关闭动画期间继续显示上一份材料
  const last = useRef(id)
  if (id)
    last.current = id
  const shown = id ?? last.current
  const detail = useQuery(() => queryDocumentDetail(shown!), [shown], { enabled: !!shown })
  const m = detail.data?.documentId === shown ? detail.data : undefined
  const p = m ? presentation(m) : null
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={(
        <div>
          <p className="text-[12px] text-ink-3">材料详情</p>
          {p
            ? <h2 className="mt-1 text-[18px] leading-snug font-semibold tracking-[-0.01em] break-words">{p.title}</h2>
            : <Skeleton className="mt-2 h-5 w-56" />}
          {p && (p.product || p.category) && <p className="mt-1.5 text-[12.5px] text-volt-text">{[p.product, p.category].filter(Boolean).join(' · ')}</p>}
          {p && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-ink-3">对外使用</span>
              {p.usageScopes.length ? p.usageScopes.map(s => <ScopeBadge key={s} scope={s} />) : <span className="text-ink-3">来源未标注</span>}
              {p.sourceStatus && <span className="text-ink-3">· 来源状态：{p.sourceStatus}</span>}
              <StatusBadge m={m!} />
            </div>
          )}
        </div>
      )}
      footer={m && (
        <>
          <Button variant="primary" className="flex-1" disabled={!isReady(m)} onClick={() => actions.onAsk(m)}><RiChat3Line className="size-4" />问一问</Button>
          <Button variant="secondary" className="flex-1" onClick={() => actions.onShare(m)}><RiShareForwardLine className="size-4" />分享</Button>
        </>
      )}
    >
      {detail.loading && !m
        ? <div className="space-y-3 pt-2"><Skeleton className="h-44 w-full rounded-2xl" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>
        : detail.error
          ? <div className="pt-2"><ErrorBar error={detail.error} onRetry={detail.reload} /></div>
          : m && <DrawerBody key={m.documentId} m={m} {...actions} />}
    </Drawer>
  )
}

function DrawerBody({ m, onRead }: { m: KbMaterial } & Actions) {
  const p = presentation(m)
  const toast = useToast()
  const preview = useQuery(() => queryMaterialPreview(m.documentId), [m.documentId], { pollMs: 4000 })
  const overview = useQuery(() => queryMaterialOverview(m.documentId), [m.documentId])
  const versions = useQuery(() => listMaterialVersions(m.documentId), [m.documentId])
  const policy = useQuery(() => getDocumentPolicy(m.documentId), [m.documentId])
  const [mediaUrl, setMediaUrl] = useState('')
  useEffect(() => {
    let url = ''
    const type = preview.data?.contentType ?? ''
    if (preview.data?.status === 'READY' && (type.startsWith('video/') || type.startsWith('audio/'))) (preview.data.contentSource === 'RENDITION' ? downloadMaterialRendition(m.documentId, preview.data.version) : downloadMaterialOriginal(m.documentId, preview.data.version)).then(blob => { url = URL.createObjectURL(new Blob([blob], { type })); setMediaUrl(url) }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [m.documentId, preview.data?.version, preview.data?.contentType, preview.data?.status])
  const [downloading, setDownloading] = useState(false)
  const md = useMemo(() => (preview.data?.kind === 'MARKDOWN' ? parseMarkdown(preview.data.content) : null), [preview.data])
  const current = versions.data?.find(v => v.current)
  const canDownload = policy.data?.permissions?.includes('DOWNLOAD') ?? false

  const download = async () => {
    if (!current)
      return
    setDownloading(true)
    try {
      saveBlob(await downloadMaterialOriginal(m.documentId, current.contentVersionId), m.originalFileName)
      toast('已开始下载原件')
    }
    catch (e) {
      toast((e as Error).message || '下载失败，请稍后重试', 'info')
    }
    finally {
      setDownloading(false)
    }
  }

  const facts = [
    ['所属知识库', m.knowledgeBaseName],
    ['原始文件名', m.originalFileName],
    ['文件格式', p.format],
    ['文件大小', fmtSize(m.fileSize)],
    ['负责人', p.owner],
    ['所属部门', p.department],
    ['来源标题', p.sourceTitle],
    ['更新时间', fmtTime(m.editTime)],
  ].filter(([, v]) => v)

  return (
    <div className="space-y-6 pt-3">
      {/* 预览 */}
      <section aria-label="材料预览">
        {preview.loading
          ? <Skeleton className="h-48 w-full rounded-2xl" />
          : md
            ? (
                <div className="relative max-h-[260px] overflow-hidden rounded-2xl border border-line bg-hover p-4">
                  <Markdown blocks={md.blocks.slice(0, 9)} size="sm" />
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--glass-3)] to-transparent" />
                </div>
              )
            : mediaUrl && preview.data?.contentType.startsWith('video/') ? <video controls playsInline preload="metadata" src={mediaUrl} className="h-48 w-full rounded-2xl border border-line bg-black object-contain" /> : mediaUrl && preview.data?.contentType.startsWith('audio/') ? <audio controls src={mediaUrl} className="mt-12 w-full" /> : <CoverPlaceholder format={p.format} title={preview.data?.status === 'CONVERTING' ? '正在处理，稍后可预览' : p.title} className="h-48 w-full" />}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="small" variant="secondary" onClick={() => onRead(m)}><RiBookOpenLine className="size-3.5" />阅读全文</Button>
          <Button size="small" variant="ghost" loading={downloading} disabled={!canDownload || !current} title={canDownload ? undefined : '当前账号没有下载权限'} onClick={download}><RiDownload2Line className="size-3.5" />下载原件</Button>
        </div>
      </section>

      {/* 概览 */}
      <section aria-label="材料概览">
        <h3 className="mb-2 text-[13.5px] font-semibold">概览</h3>
        {overview.loading
          ? <div className="space-y-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-4/5" /></div>
          : overview.error
            ? <ErrorBar error={overview.error} onRetry={overview.reload} />
            : overview.data?.status !== 'READY'
              ? <p className="text-[13px] text-ink-3">材料还在解析，概览会在处理完成后生成。</p>
              : (
                  <>
                    <p className="text-[13.5px] leading-relaxed text-ink-2">{overview.data.summary}</p>
                    {overview.data.keyPoints.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {overview.data.keyPoints.map(k => (
                          <li key={k} className="flex gap-2 text-[13px] text-ink-2"><i className="mt-2 size-1.5 shrink-0 rounded-full bg-volt" />{k}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
        <p className="mt-3 text-[12px] text-ink-3">内部可查看不代表可以对外分享，请保留原资料的使用边界。</p>
      </section>

      {p.notes && (
        <section aria-label="来源备注" className="border-t border-line pt-5">
          <h3 className="mb-2 text-[13.5px] font-semibold">来源备注</h3>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{p.notes}</p>
        </section>
      )}

      {/* 权限与版本 */}
      <section aria-label="权限与版本" className="border-t border-line pt-5">
        <h3 className="mb-3 text-[13.5px] font-semibold">权限与版本</h3>
        {policy.loading || versions.loading
          ? <Skeleton className="h-20 w-full rounded-2xl" />
          : policy.error || versions.error
            ? <ErrorBar error={policy.error ?? versions.error} onRetry={() => { policy.reload(); versions.reload() }} />
            : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <RiLock2Line className="size-4 text-ink-3" />
                    <span className="text-ink-2">{API_MODE === 'live' ? '由知识库服务校验访问权限' : ACCESS_LABEL[policy.data!.accessMode]}</span>
                    <span className="text-ink-3">· 我的权限</span>
                    {(policy.data!.permissions ?? []).map(k => <Badge key={k} tone="neutral">{PERMISSION_LABEL[k]}</Badge>)}
                  </div>
                  <ul className="overflow-hidden rounded-2xl border border-line">
                    {versions.data!.map(v => (
                      <li key={v.contentVersionId} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-b-0">
                        <RiFileList3Line className="size-4 shrink-0 text-ink-3" />
                        <span className="font-medium">{API_MODE === 'live' ? '当前内容版本' : `版本 ${v.versionNo}`}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-3">{v.originalName}</span>
                        <span className="text-[12px] text-ink-3 tabular-nums">{fmtTime(v.createdAt)}</span>
                        {v.current && <Badge tone="volt">当前</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
      </section>

      {/* 文件信息与处理状态 */}
      <section aria-label="文件信息" className="border-t border-line pt-5">
        <h3 className="mb-3 text-[13.5px] font-semibold">文件信息与处理状态</h3>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5">
          {facts.map(([k, v]) => (
            <div key={k} className={k === '原始文件名' || k === '来源标题' ? 'col-span-2' : ''}>
              <dt className="text-[12px] text-ink-3">{k}</dt>
              <dd className="mt-0.5 text-[13.5px] break-words">{v}</dd>
            </div>
          ))}
          <div><dt className="text-[12px] text-ink-3">文档解析</dt><dd className="mt-0.5 flex items-center gap-1.5 text-[13.5px]">{m.parseStatus === '4' && <RiErrorWarningLine className="size-4 text-rose" />}{m.parseStatusName}</dd></div>
          <div><dt className="text-[12px] text-ink-3">检索索引</dt><dd className="mt-0.5 text-[13.5px]">{m.indexStatusName}</dd></div>
        </dl>
      </section>
    </div>
  )
}
