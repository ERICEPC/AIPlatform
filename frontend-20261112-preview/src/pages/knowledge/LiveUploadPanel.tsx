import { useEffect, useRef, useState } from 'react'
import { listAccessibleLibraries, uploadDocument, documentParse, documentPlan, confirmDocumentPlan, indexDocument, documentIndex } from '@/api/knowledge'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Select } from '@/components/ui/form'
import { ErrorBar } from '@/components/ui/data'

type Job = { id: string, file: string, parseTask: string, indexTask?: string, planId?: string, stage: string, error?: string, uncertain?: boolean }
export function LiveUploadPanel({ open, onClose, targetLibrary, onChanged, onOpenMaterial }: { open: boolean, onClose: () => void, targetLibrary?: string, onChanged: () => void, onOpenMaterial: (id: string) => void }) {
  const libs = useQuery(listAccessibleLibraries, [open], { enabled: open })
  const [target, setTarget] = useState(targetLibrary ?? '')
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const active = useRef(new Set<string>())
  useEffect(() => { if (open) setTarget(targetLibrary ?? '') }, [open, targetLibrary])
  useEffect(() => { if (open && libs.data && !libs.data.some(l => l.id === target)) setTarget(libs.data[0]?.id ?? '') }, [open, target, libs.data])
  const patch = (job: Job, data: Partial<Job>) => { Object.assign(job, data); setJobs(list => list.map(j => j.id === job.id ? { ...job } : j)) }
  const wait = () => new Promise(resolve => setTimeout(resolve, 3000))
  async function process(job: Job) {
    if (active.current.has(job.id) || job.uncertain) return
    active.current.add(job.id)
    patch(job, { error: undefined })
    try {
      const deadline = Date.now() + 600000
      if (!job.indexTask) {
        patch(job, { stage: '正在解析' })
        while (true) {
          const p = await documentParse(job.id, job.parseTask)
          if (String(p.parseStatus) === '3') break
          if (String(p.parseStatus) === '4') throw new Error(p.parseErrorMsg || '解析失败，请在知识库中检查材料')
          if (Date.now() > deadline) throw new Error('仍在处理，可点击刷新进度继续查看')
          await wait()
        }
        if (!job.planId) {
          patch(job, { stage: '准备索引方案' })
          let p = await documentPlan(job.id)
          while (!p.planReady) {
            if (Date.now() > deadline) throw new Error('索引方案仍在生成，请稍后刷新进度')
            await wait(); p = await documentPlan(job.id)
          }
          const steps = (pipeline: typeof p.plan.parentPipeline) => pipeline.steps.map(({ stepNo, strategyType }) => ({ stepNo, strategyType }))
          patch(job, { uncertain: true })
          const confirmed = await confirmDocumentPlan(job.id, { basePlanId: p.plan.planId, basePlanVersion: p.plan.planVersion, parentSteps: steps(p.plan.parentPipeline), childSteps: steps(p.plan.childPipeline), ...((p.chunkingContract ?? p.plan.chunkingContract) ? { sourceParseTaskId: (p.chunkingContract ?? p.plan.chunkingContract)!.sourceParseTaskId, chunkingProfile: (p.chunkingContract ?? p.plan.chunkingContract)!.recommendedProfile } : {}) })
          patch(job, { planId: confirmed.planId, uncertain: false })
        }
        patch(job, { stage: '提交索引', uncertain: true })
        const indexed = await indexDocument(job.id, job.planId!)
        patch(job, { indexTask: indexed.taskId, uncertain: false })
      }
      patch(job, { stage: '正在建立索引' })
      while (true) {
        const p = await documentIndex(job.id, job.indexTask!)
        if (String(p.indexStatus) === '3') break
        if (String(p.indexStatus) === '4') throw new Error(p.errorMessage || '索引失败，请在知识库中检查材料')
        if (Date.now() > deadline) throw new Error('仍在建立索引，可刷新进度继续查看')
        await wait()
      }
      patch(job, { stage: '已可用于问答' }); onChanged()
    } catch (e) {
      patch(job, { error: (e as Error).message + (job.uncertain ? '；提交结果尚未确认，请先查看材料状态，勿重复上传。' : '') })
    } finally { active.current.delete(job.id) }
  }
  async function upload(files: FileList | null) {
    if (!files || !target || busy) return
    setError(null); setBusy(true)
    try {
      if (files.length > 20) throw new Error('一次最多上传 20 份材料')
      const selected = Array.from(files)
      if (selected.some(file => !file.size || file.size > 128 * 1024 * 1024)) throw new Error('文件应非空且不超过 128 MiB')
      for (const file of selected) {
        const result = await uploadDocument(target, file, '待确认')
        const job: Job = { id: result.documentId, parseTask: result.taskId, file: file.name, stage: '等待解析' }
        setJobs(list => [...list, job]); onChanged(); void process(job)
      }
    } catch (e) { setError(new Error((e as Error).message + '。若上传中断，请先刷新材料列表确认是否已经入库。')) }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  return <Drawer open={open} onClose={onClose} title="上传材料" footer={<Button onClick={onClose}>完成</Button>}>
    <div className="space-y-4 py-4">
      <p className="text-sm text-ink-3">文件直接上传到公网知识库，不只保存在中台。上传权限由所选知识库校验；没有权限时会明确提示。上传后解析材料并建立索引，请保留当前页面查看进度。</p>
      <p className="text-sm font-medium">目标知识库</p>
      <Select value={target} onValueChange={setTarget} options={(libs.data ?? []).map(l => ({ value: l.id, label: l.baseName }))} />
      {!libs.loading && !libs.error && !libs.data?.length && <p className="text-sm text-ink-3">暂无可访问的知识库，请先创建知识库或联系库管理员授权。</p>}
      <ErrorBar error={error || libs.error} />
      <input ref={input} type="file" multiple className="hidden" onChange={e => void upload(e.target.files)} />
      <Button variant="primary" disabled={!target || busy} loading={busy} onClick={() => input.current?.click()}>选择文件上传</Button>
      {jobs.map(j => <div key={j.id} className="rounded-2xl border border-line bg-hover p-4 space-y-2"><p className="font-medium">{j.file}</p><p className="text-sm text-ink-3">{j.stage}</p>{j.error && <p className="text-sm text-rose">{j.error}</p>}<Button size="small" onClick={() => onOpenMaterial(j.id)}>查看材料</Button>{j.error && !j.uncertain && <Button size="small" onClick={() => void process(j)}>刷新进度</Button>}</div>)}
    </div>
  </Drawer>
}
