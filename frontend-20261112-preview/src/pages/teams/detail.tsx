import type { SectionItem } from '@/components/detail-shell'
import type { Agent, Config, Team } from '@/api/teams'
import { RiArrowDownSLine, RiBarChartBoxLine, RiCheckboxCircleLine, RiCloseLine, RiFileList3Line, RiHistoryLine, RiLinksLine, RiPlayCircleLine, RiSave3Line, RiSendPlaneLine, RiTeamLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getTeam, publishTeam, saveTeam } from '@/api/teams'
import { DetailShell } from '@/components/detail-shell'
import { Page } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Menu } from '@/components/ui/menu'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { Tip } from '@/components/ui/tooltip'
import { spring } from '@/lib/motion'
import { TeamAccess } from './access'
import { TeamLogs } from './logs'
import { defaultDuty } from './agent-source'
import { TeamMembers } from './members'
import { TeamMonitoring } from './monitoring'
import { TeamRunner } from './runner'
import { ConflictBanner, errText, fmtTime, isConflict, TeamAvatar } from './shared'
import { useTeamActions } from './team-dialogs'

export type Section = 'members' | 'run' | 'access' | 'logs' | 'monitoring'
const SECTIONS: SectionItem<Section>[] = [
  { id: 'members', label: '成员', icon: RiTeamLine },
  { id: 'run', label: '运行', icon: RiPlayCircleLine },
  { id: 'access', label: '访问', icon: RiLinksLine },
  { id: 'logs', label: '日志', icon: RiFileList3Line },
  { id: 'monitoring', label: '监控', icon: RiBarChartBoxLine },
]
const HEAD: Record<Section, [string, string]> = {
  members: ['成员', '选一位团长和参与的 Agent。协作方式由团长按任务自动决定，不需要编排流程。'],
  run: ['运行', '和团队对话：团长按需请参与的 Agent 处理，再汇总成一份答复。'],
  access: ['访问', '此团队的所有访问方式。正式调用使用已发布版本。'],
  logs: ['日志', '每次任务的用户输入、团队回复，以及调用了哪些 Agent。'],
  monitoring: ['监控', '跟踪该团队在所有访问点上的任务、协作效率与用量。'],
}

export function TeamDetail({ id, sub, go }: { id: string, sub?: string, go: (p: string) => void }) {
  const section: Section = SECTIONS.some(s => s.id === sub) ? (sub as Section) : 'members'
  // 旧地址 #teams/<id>/orchestrate（以及其他无效分区）替换为 #teams/<id>/members，不留历史记录
  useEffect(() => {
    if (sub && !SECTIONS.some(s => s.id === sub))
      location.replace(`#teams/${id}/members`)
  }, [id, sub])
  const q = useQuery(() => getTeam(id), [id])
  const team = q.data?.team
  const agents = q.data?.agents ?? []
  const [form, setForm] = useState<Config | null>(null)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const toast = useToast()

  // 每次拿到新 revision 时用服务端配置覆盖本地草稿
  // 有未保存修改时只同步名称、简介、头像（例如刚在「编辑信息」里改过），保留成员页上的编辑
  useEffect(() => {
    if (!team)
      return
    const keep = dirtyRef.current && !forceReset.current
    forceReset.current = false
    setForm(f => (f && keep ? { ...f, name: team.config.name, description: team.config.description, avatar: team.config.avatar } : structuredClone(team.config)))
  }, [team?.id, team?.revision]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!team && !!form && JSON.stringify(form) !== JSON.stringify(team.config)
  const dirtyRef = useRef(dirty)
  const forceReset = useRef(false)
  dirtyRef.current = dirty

  const save = useCallback(async () => {
    if (!team || !form)
      return false
    // 「负责什么」在页面上是选填，后端要求非空：留空的用 Agent 简介补上
    const config: Config = {
      ...form,
      members: form.members.map((m) => {
        if (m.responsibility.trim())
          return m
        const a = agents.find(x => x.id === m.agent_id)
        return { ...m, responsibility: defaultDuty({ name: a?.name ?? 'Agent', description: a?.description ?? '', role: '' }) }
      }),
    }
    setForm(config)
    setBusy('save')
    try {
      await saveTeam(team.id, config, team.revision)
      await q.refresh()
      toast('草稿已保存，正式调用仍使用已发布版本')
      return true
    }
    catch (e) {
      if (isConflict(e))
        setConflict(errText(e))
      else
        toast(errText(e, '保存失败，请检查必填项'), 'info')
      return false
    }
    finally {
      setBusy(null)
    }
  }, [team, form, agents, q, toast])

  const publish = async () => {
    if (!team)
      return
    setBusy('publish')
    try {
      const r = await publishTeam(team.id, team.revision)
      await q.refresh()
      setNotice(`已发布 v${r.version}。团队配置及所有成员版本已固定，草稿修改不会影响正式调用。`)
    }
    catch (e) {
      if (isConflict(e))
        setConflict(errText(e))
      else
        toast(errText(e, '发布失败'), 'info')
    }
    finally {
      setBusy(null)
    }
  }

  const { items, dialogs } = useTeamActions(team, { onChanged: q.refresh, onConflict: setConflict, onCopied: t => go(`teams/${t.id}`), onDeleted: () => go('teams') })
  const versions = team?.versions ?? []
  const versionItems = versions.length
    ? versions.map(v => ({
        label: <span className="flex flex-col"><span className="font-medium">v{v.version}<span className="ml-2 text-[11.5px] font-normal text-ink-3">{fmtTime(v.created_at)}</span></span><span className="font-mono text-[11px] text-ink-3">{v.id}</span></span>,
        hint: v.id === team?.published_id ? '当前版本' : '历史版本',
        onSelect: () => { navigator.clipboard?.writeText(v.id).catch(() => {}); toast(`已复制 v${v.version} 的快照 ID`) },
      }))
    : [{ label: '暂无已发布版本', disabled: true, onSelect: () => {} }]

  const identity = team
    ? (
        <div className="flex items-start gap-2.5">
          <TeamAvatar value={team.config.avatar} name={team.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] leading-tight font-semibold" title={team.name}>{team.name}</p>
            <div className="mt-1">{team.published_id ? <Badge tone="mint">已发布 v{team.published_version ?? versions.find(v => v.id === team.published_id)?.version}</Badge> : <Badge>未发布</Badge>}</div>
          </div>
          <Menu items={items} />
        </div>
      )
    : <div className="flex items-center gap-2.5"><Skeleton className="size-10 rounded-xl" /><Skeleton className="h-4 flex-1" /></div>

  const props = form && team ? { team, form, setForm: setForm as (f: (c: Config) => Config) => void, agents, dirty, save, reload: q.refresh, go } : null

  return (
    <Page>
      <DetailShell
        back={{ label: 'Agent Teams', onClick: () => go('teams') }}
        identity={identity}
        sections={SECTIONS}
        active={section}
        onSection={s => go(`teams/${id}/${s}`)}
        layoutId="team-section"
        footer={team && <p className="px-2 text-[11.5px] leading-relaxed text-ink-3">草稿 r{team.revision} · {fmtTime(team.updated_at)} 保存</p>}
      >
        <ConflictBanner message={conflict} onClose={() => setConflict(null)} onRefresh={() => { forceReset.current = true; q.reload() }} />
        <header className="flex items-end gap-4 px-6 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.025em]">{HEAD[section][0]}</h1>
            <p className="mt-1 truncate text-[13px] text-ink-2">{HEAD[section][1]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AnimatePresence>
              {dirty && (
                <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring.smooth} className="flex items-center gap-1.5 text-[12.5px] text-amber">
                  <i className="breathe-dot size-1.5 rounded-full bg-amber text-amber" />有尚未保存的修改
                </motion.span>
              )}
            </AnimatePresence>
            <Menu
              align="end"
              items={versionItems}
              trigger={<Button variant="ghost" size="medium"><RiHistoryLine className="size-4" />版本{versions.length ? ` · ${versions.length}` : ''}<RiArrowDownSLine className="size-4" /></Button>}
            />
            <Button variant="secondary" disabled={!dirty || !!busy} loading={busy === 'save'} onClick={save}><RiSave3Line className="size-4" />保存草稿</Button>
            <Tip label={dirty ? '请先保存草稿' : '固定团长、参与的 Agent 及它们的当前版本'}>
              <span><Button variant="primary" disabled={dirty || !team || !!busy} loading={busy === 'publish'} onClick={publish}><RiSendPlaneLine className="size-4" />发布</Button></span>
            </Tip>
          </div>
        </header>
        <AnimatePresence>
          {notice && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-6">
              <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-mint/30 bg-mint-soft px-4 py-2.5 text-[13px] text-mint">
                <RiCheckboxCircleLine className="size-4 shrink-0" /><span className="flex-1">{notice}</span>
                <button type="button" aria-label="关闭提示" onClick={() => setNotice('')} className="cursor-pointer opacity-70 hover:opacity-100"><RiCloseLine className="size-4" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {q.error && <div className="px-6 pb-3"><ErrorBar error={q.error} onRetry={q.reload} /></div>}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {!props
            ? !q.error && <div className="flex flex-1 flex-col gap-3 p-6 pt-1"><Skeleton className="h-36 rounded-[22px]" /><Skeleton className="h-64 rounded-[22px]" /></div>
            : section === 'members'
              ? <TeamMembers {...props} />
              : section === 'run'
                ? <TeamRunner {...props} />
                : section === 'access'
                  ? <TeamAccess {...props} />
                  : section === 'logs'
                    ? <TeamLogs {...props} />
                    : <TeamMonitoring {...props} />}
        </div>
      </DetailShell>
      {dialogs}
    </Page>
  )
}

export type SectionProps = {
  team: Team
  form: Config
  setForm: (f: (c: Config) => Config) => void
  agents: Agent[]
  dirty: boolean
  save: () => Promise<boolean>
  reload: () => Promise<void> | void
  go: (p: string) => void
}
