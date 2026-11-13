import type { KbMaterial, KbShareCreated } from '@/api/knowledge'
import { RiExternalLinkLine, RiShieldCheckLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@/api/hooks'
import { createShare, getShareEligibility, getShareSettings } from '@/api/knowledge'
import { Button } from '@/components/ui/button'
import { CopyField, ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, NumberInput, Textarea } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { KB_APP_HINT, kbAppUrl, presentation } from './shared'

/**
 * 对客分享：先核验这份材料能否对客分享，再填标题、有效期，生成链接。
 * 分享管理、访问分析和留资线索在完整知识库里（「更多知识库功能」）。
 */
export function ShareDialog({ material, onClose }: { material: KbMaterial | null, onClose: () => void }) {
  return (
    <Dialog open={!!material} onOpenChange={o => !o && onClose()} title="分享给客户" description={material ? `《${presentation(material).title}》` : undefined} size="md">
      {material && <ShareBody key={material.documentId} material={material} onClose={onClose} />}
    </Dialog>
  )
}

function ShareBody({ material, onClose }: { material: KbMaterial, onClose: () => void }) {
  const toast = useToast()
  const eligibility = useQuery(() => getShareEligibility(material.documentId), [material.documentId])
  const settings = useQuery(getShareSettings, [])
  const [title, setTitle] = useState(presentation(material).title)
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const [created, setCreated] = useState<KbShareCreated | null>(null)
  const create = useMutation(createShare)

  useEffect(() => {
    if (settings.data)
      setDays(settings.data.defaultDays)
  }, [settings.data])

  if (eligibility.loading || settings.loading)
    return <div className="space-y-3 py-2"><Skeleton className="h-11 w-full rounded-2xl" /><Skeleton className="h-11 w-full rounded-2xl" /></div>
  if (eligibility.error || settings.error)
    return <div className="py-2"><ErrorBar error={eligibility.error ?? settings.error} onRetry={() => { eligibility.reload(); settings.reload() }} /></div>
  if (!eligibility.data?.allowed) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-amber-soft text-amber"><RiShieldCheckLine className="size-6" /></span>
        <p className="font-semibold">这份材料暂不能对客分享</p>
        <p className="max-w-[360px] text-[13px] text-ink-3">{eligibility.data?.reason}</p>
        <Button variant="secondary" onClick={onClose}>知道了</Button>
      </div>
    )
  }

  if (created) {
    const full = kbAppUrl(created.path) || created.path
    const manage = kbAppUrl('/materials/shares')
    return (
      <div className="space-y-4 pb-2">
        <p className="text-[13.5px] text-ink-2">链接已生成，{days} 天内有效。客户打开前需要填写留资表单。</p>
        <CopyField value={full} mono />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink-3">{manage ? '续期、撤销和访问数据在「我的分享」里管理。' : KB_APP_HINT}</span>
          <Button variant="ghost" size="small" disabled={!manage} onClick={() => manage && window.open(manage, '_blank', 'noopener')}><RiExternalLinkLine className="size-3.5" />我的分享</Button>
        </div>
        <div className="flex justify-end"><Button variant="primary" onClick={onClose}>完成</Button></div>
      </div>
    )
  }

  const max = settings.data?.maxDays ?? 180
  const submit = async () => {
    try {
      setCreated(await create.run({ documentIds: [material.documentId], validDays: days, title: title.trim() || null, note: note.trim() || null }))
      toast('分享链接已生成')
    }
    catch {}
  }
  return (
    <div className="space-y-4 pb-2">
      <Field label="分享标题" hint="客户打开链接时看到的标题。">
        <Input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
      </Field>
      <Field label="有效期" hint={`1–${max} 天，到期后链接自动失效。`}>
        <NumberInput value={days} min={1} max={max} onChange={setDays} suffix="天" />
      </Field>
      <Field label="备注" aside="仅自己可见">
        <Textarea rows={2} value={note} maxLength={200} placeholder="例如：发给某城商行信息科技部" onChange={e => setNote(e.target.value)} />
      </Field>
      <ErrorBar error={create.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button variant="primary" loading={create.pending} onClick={submit}>生成分享链接</Button>
      </div>
    </div>
  )
}
