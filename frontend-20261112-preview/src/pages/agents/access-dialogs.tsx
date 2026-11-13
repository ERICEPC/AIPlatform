import type { ApiAccess, ApiKey, AppSite, AppSitePayload } from '@/api/agents'
import { RiAddLine, RiAlertLine, RiCheckLine, RiDeleteBinLine, RiFileCopyLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { createApiKey, deleteApiKey, listApiKeys, updateSite } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { CopyField, DataTable } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { dateTime, errText, fromNow, IconBtn } from './shared'

function Code({ code }: { code: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative">
      <pre className="max-h-[320px] overflow-auto rounded-2xl border border-line bg-hover p-4 pr-12 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">{code}</pre>
      <button
        type="button"
        aria-label="复制"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code)
            setDone(true)
            setTimeout(() => setDone(false), 1400)
          }
          catch {}
        }}
        className="absolute top-2.5 right-2.5 grid size-8 cursor-pointer place-items-center rounded-lg text-ink-3 hover:bg-press hover:text-ink"
      >
        {done ? <RiCheckLine className="size-4 text-mint" /> : <RiFileCopyLine className="size-4" />}
      </button>
    </div>
  )
}

/* ---------- 嵌入 ---------- */
export function EmbedDialog({ open, onOpenChange, url, token, base }: { open: boolean, onOpenChange: (o: boolean) => void, url: string, token: string, base: string }) {
  const [mode, setMode] = useState<'iframe' | 'script'>('iframe')
  const iframe = `<iframe\n  src="${url}"\n  style="width: 100%; height: 100%; min-height: 700px"\n  frameborder="0"\n  allow="microphone">\n</iframe>`
  const script = `<script>\n  window.raccoonChatbotConfig = {\n    token: '${token}',\n    baseUrl: '${base}',\n  }\n</script>\n<script src="${base}/embed.min.js" id="${token}" defer></script>\n<style>\n  #raccoon-chatbot-bubble-button { background-color: #1C64F2 !important; }\n  #raccoon-chatbot-bubble-window { width: 24rem !important; height: 40rem !important; }\n</style>`
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="嵌入到网站" description="复制代码粘贴到你的网页 HTML 里。">
      <Segmented value={mode} onValueChange={setMode} options={[{ value: 'iframe', label: '整页嵌入' }, { value: 'script', label: '右下角气泡' }]} />
      <div className="mt-3 grid grid-cols-[180px_1fr] gap-4">
        <div className="grid aspect-[3/4] place-items-center rounded-2xl border border-line bg-hover p-3">
          {mode === 'iframe'
            ? <div className="size-full rounded-xl border border-line-strong bg-glass-3 p-2"><div className="h-2 w-1/2 rounded bg-press" /><div className="mt-2 h-[70%] rounded-lg bg-volt-soft" /></div>
            : <div className="relative size-full rounded-xl border border-line-strong bg-glass-3"><span className="absolute right-2 bottom-2 size-6 rounded-full bg-volt shadow-glow-volt" /></div>}
        </div>
        <Code code={mode === 'iframe' ? iframe : script} />
      </div>
    </Dialog>
  )
}

/* ---------- 品牌设置 ---------- */
const THEMES = ['#1b477f', '#1C64F2', '#0aa6c2', '#347ac4', '#b86a00', '#d6334f', '#0b0d0c']
export function BrandDialog({ open, onOpenChange, appId, site, onSaved }: { open: boolean, onOpenChange: (o: boolean) => void, appId: string, site: AppSite, onSaved: (s: AppSite) => void }) {
  const toast = useToast()
  const [v, setV] = useState<AppSitePayload>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      const { access_token: _t, app_base_url: _b, ...rest } = site
      setV(rest)
    }
  }, [open, site])
  const set = (p: AppSitePayload) => setV(x => ({ ...x, ...p }))
  const save = async () => {
    if (!v.title?.trim())
      return
    setBusy(true)
    try {
      onSaved(await updateSite(appId, v))
      toast('品牌设置已保存')
      onOpenChange(false)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="品牌设置" description="Web 应用页面上显示的名称、主题色和说明。" footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" loading={busy} disabled={!v.title?.trim()} onClick={save}>保存</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="页面标题" required error={!v.title?.trim() ? '请填写标题' : undefined}><Input value={v.title ?? ''} onChange={e => set({ title: e.target.value })} /></Field>
        <Field label="界面语言">
          <Select value={v.default_language ?? 'zh-Hans'} onValueChange={x => set({ default_language: x })} options={[{ value: 'zh-Hans', label: '简体中文' }, { value: 'en-US', label: 'English' }, { value: 'ja-JP', label: '日本語' }]} />
        </Field>
        <Field label="简介" className="col-span-2"><Textarea rows={2} value={v.description ?? ''} placeholder="显示在对话页顶部" onChange={e => set({ description: e.target.value })} /></Field>
        <Field label="主题色">
          <div className="flex flex-wrap items-center gap-2">
            {THEMES.map(c => <button key={c} type="button" aria-label={c} onClick={() => set({ chat_color_theme: c })} className={cn('size-7 cursor-pointer rounded-full border-2', v.chat_color_theme === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} />)}
          </div>
        </Field>
        <Field label="输入框提示"><Input value={v.input_placeholder ?? ''} placeholder="和我聊聊吧" onChange={e => set({ input_placeholder: e.target.value })} /></Field>
        <Field label="版权"><Input value={v.copyright ?? ''} placeholder="© 2026 翼飞科技" onChange={e => set({ copyright: e.target.value })} /></Field>
        <Field label="隐私政策链接"><Input value={v.privacy_policy ?? ''} placeholder="https://" onChange={e => set({ privacy_policy: e.target.value })} /></Field>
        <Field label="免责声明" className="col-span-2"><Input value={v.custom_disclaimer ?? ''} placeholder="AI 生成内容仅供参考" onChange={e => set({ custom_disclaimer: e.target.value })} /></Field>
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-3 text-[13px]">显示执行步骤<Switch aria-label="显示执行步骤" checked={!!v.show_workflow_steps} onCheckedChange={c => set({ show_workflow_steps: c })} /></label>
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-3 text-[13px]">回答时使用 Agent 图标<Switch aria-label="回答时使用 Agent 图标" checked={!!v.use_icon_as_answer_icon} onCheckedChange={c => set({ use_icon_as_answer_icon: c })} /></label>
      </div>
    </Dialog>
  )
}

/* ---------- API Key ---------- */
export function ApiKeysDialog({ open, onOpenChange, agentId, onCount }: { open: boolean, onOpenChange: (o: boolean) => void, agentId: string, onCount: (n: number) => void }) {
  const toast = useToast()
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [fresh, setFresh] = useState<ApiKey | null>(null)
  const [del, setDel] = useState<ApiKey | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => listApiKeys(agentId).then((r) => {
    setKeys(r.data)
    onCount(r.data.length)
  }).catch(e => toast(errText(e), 'info'))
  useEffect(() => {
    if (open) {
      setFresh(null)
      setKeys(null)
      load()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const create = async () => {
    setBusy(true)
    try {
      setFresh(await createApiKey(agentId))
      await load()
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!del)
      return
    setBusy(true)
    try {
      await deleteApiKey(agentId, del.id)
      setDel(null)
      await load()
      toast('API Key 已删除')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="API Key" description="密钥可以调用这个 Agent 的全部接口，不要放在前端代码或公开仓库里。" footer={<Button variant="primary" loading={busy} onClick={create}><RiAddLine className="size-4" />新建 API Key</Button>}>
      {fresh && (
        <div className="mb-4 rounded-2xl border border-amber/40 bg-amber-soft p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber"><RiAlertLine className="size-4" />新密钥只显示这一次，请现在复制保存</p>
          <CopyField className="mt-2" value={fresh.token} mono />
        </div>
      )}
      <DataTable<ApiKey>
        loading={!keys}
        rows={keys ?? []}
        rowKey={k => k.id}
        empty="还没有 API Key"
        columns={[
          { key: 'token', title: '密钥', render: k => <span className="font-mono text-[12.5px]">{k.token}</span> },
          { key: 'created', title: '创建时间', width: '150px', render: k => <span className="text-ink-2">{dateTime(k.created_at)}</span> },
          { key: 'used', title: '最近使用', width: '110px', render: k => <span className="text-ink-3">{k.last_used_at ? fromNow(k.last_used_at) : '从未使用'}</span> },
          { key: 'op', title: '', width: '40px', align: 'right', render: k => <IconBtn label="删除" danger onClick={() => setDel(k)}><RiDeleteBinLine className="size-4" /></IconBtn> },
        ]}
      />
      <ConfirmDialog open={!!del} onOpenChange={o => !o && setDel(null)} danger title="删除这个 API Key？" description="使用它的系统会立即无法调用，删除后不可恢复。" confirmText="删除" loading={busy} onConfirm={remove} />
    </Dialog>
  )
}

/* ---------- API 参考 ---------- */
export function ApiReferenceDialog({ open, onOpenChange, access }: { open: boolean, onOpenChange: (o: boolean) => void, access: ApiAccess }) {
  const [tab, setTab] = useState<'chat' | 'stop' | 'messages' | 'upload'>('chat')
  const h = `  -H 'Authorization: Bearer {API_KEY}' \\\n`
  const code = {
    chat: `curl -X POST '${access.chat_endpoint}' \\\n${h}  -H 'Content-Type: application/json' \\\n  --data-raw '{\n    "inputs": {},\n    "query": "X3 路由器无法开机怎么办",\n    "response_mode": "streaming",\n    "conversation_id": "",\n    "user": "user-123"\n  }'`,
    stop: `curl -X POST '${access.stop_endpoint}' \\\n${h}  -H 'Content-Type: application/json' \\\n  --data-raw '{ "user": "user-123" }'`,
    messages: `curl -X GET '${access.messages_endpoint}?user=user-123&conversation_id={conversation_id}&limit=20' \\\n${h.slice(0, -3)}`,
    upload: `curl -X POST '${access.files_upload_endpoint}' \\\n${h}  --form 'file=@"/path/to/file.pdf"' \\\n  --form 'user=user-123'`,
  }[tab]
  const desc = { chat: '发送对话消息。只支持流式返回（SSE），每个事件一行 data: {...}。', stop: '停止正在生成的回答，task_id 来自流式事件。', messages: '按会话分页读取历史消息。', upload: '上传文件，返回的 id 可放进对话的 files 里。' }[tab]
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="API 参考" description={`服务地址 ${access.service_api_base_url}，鉴权使用 Bearer API Key。`}>
      <Segmented size="small" value={tab} onValueChange={setTab} options={[{ value: 'chat', label: '发送消息' }, { value: 'stop', label: '停止生成' }, { value: 'messages', label: '历史消息' }, { value: 'upload', label: '上传文件' }]} />
      <p className="mt-3 mb-2 text-[13px] text-ink-2">{desc}</p>
      <Code code={code} />
      <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
        {[['会话列表', access.conversations_endpoint], ['参数配置', access.parameters_endpoint]].map(([k, v]) => <div key={k} className="rounded-xl border border-line px-3 py-2"><p className="text-ink-3">{k}</p><p className="truncate font-mono">{v}</p></div>)}
      </div>
    </Dialog>
  )
}
