import type { DesktopState } from '@/api/tune'
import { RiCloudLine, RiComputerLine, RiDownloadLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getDesktop, saveDesktopSettings } from '@/api/tune'
import { KV, MetricRow, Section, SettingRow, StatusTag } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Select } from '@/components/ui/form'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'

/* 桌面与云端：轻量本地连接器操作本机工作区，核心 Worker 在云端运行 */
export function TuneDesktop() {
  const toast = useToast()
  const q = useQuery(getDesktop, [])
  const [s, setS] = useState<DesktopState['settings'] | null>(null)
  useEffect(() => { if (q.data) setS(q.data.settings) }, [q.data])
  if (q.error)
    return <ErrorBar error={q.error} onRetry={q.reload} />
  const d = q.data
  if (!d || !s)
    return <Skeleton className="h-64" />
  const total = d.split_7d.desktop + d.split_7d.cloud + d.split_7d.human
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MetricRow items={[
        { label: '桌面端执行（近 7 天）', value: d.split_7d.desktop, sub: `${Math.round((d.split_7d.desktop / total) * 100)}% 的步骤` },
        { label: '云端执行', value: d.split_7d.cloud, sub: `${d.cloud.region} · ${d.cloud.workers} 个 Worker` },
        { label: '交给人确认', value: d.split_7d.human },
        { label: '云端运行中 / 排队', value: `${d.cloud.running} / ${d.cloud.queued}` },
      ]} />
      <Section title="桌面连接器" desc="连接器装在你的电脑上，只在授权的工作区内读写文件、运行已登记命令；文件不上传云端。" actions={<Button><RiDownloadLine className="size-4" />下载连接器</Button>}>
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          {d.connectors.map(c => (
            <div key={c.id} className="rounded-lg border border-line p-4">
              <div className="flex items-center gap-2"><RiComputerLine className="size-5 text-ink-3" /><p className="font-semibold">{c.device}</p><span className="ml-auto"><StatusTag status={c.status === 'online' ? 'ok' : 'off'} label={c.status === 'online' ? '在线' : '离线'} /></span></div>
              <div className="mt-3"><KV items={[['系统', c.os], ['版本', c.version], ['工作区', <span className="font-mono text-[12.5px]">{c.workspace}</span>], ['最近心跳', new Date(c.last_seen).toLocaleString('zh-CN')]]} /></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{c.allowed.map(a => <Badge key={a}>{a}</Badge>)}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="协同设置" actions={<Button variant="primary" onClick={async () => { await saveDesktopSettings(s); toast('已保存') }}>保存</Button>}>
        <SettingRow title="本机文件优先在桌面端处理" hint="开启后，涉及本机文件的步骤只在连接器上执行。"><Switch aria-label="本机文件优先" checked={s.prefer_local_files} onCheckedChange={v => setS({ ...s, prefer_local_files: v })} /></SettingRow>
        <SettingRow title="产物同步到云端会话" hint="桌面端生成的文件以文件卡形式回到对话，便于预览和下载。"><Switch aria-label="产物同步" checked={s.sync_artifacts} onCheckedChange={v => setS({ ...s, sync_artifacts: v })} /></SettingRow>
        <SettingRow title="连接器离线时排队" hint="离线期间需要本机的步骤进入队列，上线后继续；不依赖本机的步骤照常在云端执行。"><Switch aria-label="离线排队" checked={s.offline_queue} onCheckedChange={v => setS({ ...s, offline_queue: v })} /></SettingRow>
        <SettingRow title="命令执行策略" hint="默认拒绝：只运行管理员登记且你授权的命令。"><Select size="sm" className="w-44" value={s.command_policy} onValueChange={v => setS({ ...s, command_policy: v })} options={[{ value: 'deny_by_default', label: '默认拒绝' }, { value: 'allow_listed', label: '允许已登记命令' }]} /></SettingRow>
      </Section>
      <Section title="一次任务怎么分到桌面和云端">
        <div className="flex items-center gap-3 text-[13px] text-ink-2 max-lg:flex-col max-lg:items-start">
          <span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"><RiCloudLine className="size-4 text-volt-text" />云端：理解目标、检索、调用专家与 Skill、生成</span>
          <span>⇄</span>
          <span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"><RiComputerLine className="size-4 text-volt-text" />桌面：读写本机文件、运行命令、打开本机应用</span>
          <span>→</span>
          <span className="rounded-lg border border-line bg-surface px-3 py-2">结果回到同一对话，关键动作先确认</span>
        </div>
      </Section>
    </div>
  )
}
