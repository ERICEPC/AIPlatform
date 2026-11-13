import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { createLibrary, listAccessibleLibraries } from '@/api/knowledge'
import { KB_APP_URL } from '@/api/http'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/form'
export function LibraryPanel({ open, onClose, onChanged }: { open: boolean, onClose: () => void, onChanged: () => void }) {
  const libs = useQuery(listAccessibleLibraries, [open], { enabled: open })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  async function create(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim() || busy) return
    setBusy(true); setError(null)
    try { await createLibrary(name.trim()); setName(''); libs.reload(); onChanged() }
    catch (e) { setError(e as Error) } finally { setBusy(false) }
  }
  return <Drawer open={open} onClose={onClose} title="知识库管理" footer={<Button onClick={onClose}>返回材料列表</Button>}><div className="space-y-4 py-4">
    <p className="text-sm text-ink-3">新建的私有库归属于当前对接账号。改名、归档和权限设置请在完整知识库中操作。</p>
    <form onSubmit={create} className="flex gap-2"><Input value={name} onChange={e => setName(e.target.value)} placeholder="新知识库名称" maxLength={80} /><Button type="submit" variant="primary" disabled={!name.trim() || busy} loading={busy}>创建</Button></form>
    <ErrorBar error={error || libs.error} />
    {libs.data?.map(l => <div className="rounded-2xl border border-line p-4" key={l.id}><p>{l.baseName}</p><p className="text-xs text-ink-3 mt-2">{l.documentCount ?? l.retrievableDocumentCount ?? '—'} 份材料</p></div>)}
    <a className="text-sm text-volt-text" href={`${KB_APP_URL}/materials`} target="_blank" rel="noreferrer">打开完整知识库 ↗</a>
  </div></Drawer>
}
