'use client'

import type { TeamAvatarValue } from './team-avatar'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useQueryState } from 'nuqs'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentWorkspaceIdAtom } from '@/context/workspace-state'
import { userProfileQueryOptions } from '@/features/account-profile/client'
import {
  rosterCreatedByMeQueryParser,
  rosterFilterQueryParser,
  rosterKeywordQueryParser,
  rosterSortByQueryParser,
} from '@/features/agent-v2/roster/query-params'
import useDocumentTitle from '@/hooks/use-document-title'
import Link from '@/next/link'
import { usePathname, useRouter, useSearchParams } from '@/next/navigation'
import { get, post } from '@/service/agent-teams'
import { TeamAccess } from './access'
import { TeamLogs } from './logs'
import { TeamMonitoring } from './monitoring'
import { teamRunUrl } from './runner-links'
import { TeamActions } from './team-actions'
import { TeamAvatar, TeamAvatarEditor } from './team-avatar'
import { selectTeams } from './team-list-filter'
import { TeamListToolbar } from './team-list-toolbar'
import styles from './teams.module.css'

type Agent = { id: string; name: string; description: string; snapshot_id: string; version: number }
type Member = { editor_key?: string; agent_id: string; responsibility: string; input_hint: string }
type Config = {
  avatar?: TeamAvatarValue | null
  name: string
  description?: string
  goal: string
  leader_id: string
  members: Member[]
  output: string
  parallelism: number
  max_calls: number
  max_rounds: number
  timeout: number
}
type Version = { id: string; version: number; revision: number; created_at: number }
type Team = {
  avatar_url?: string
  id: string
  name: string
  revision: number
  config: Config
  published_id: string | null
  versions?: Version[]
  published_version?: number
  updated_at: number
  created_at: number
  created_by: string
}
const divisionMarker = '\n\n【分工方式】\n'
const splitGoal = (goal: string): [string, string] => {
  const index = goal.indexOf(divisionMarker)
  return index < 0 ? [goal, ''] : [goal.slice(0, index), goal.slice(index + divisionMarker.length)]
}
const base = '/agent-teams'
const blank: Config = {
  name: '',
  goal: '',
  leader_id: '',
  members: [],
  output: '',
  parallelism: 2,
  max_calls: 4,
  max_rounds: 2,
  timeout: 120,
}
function TeamContent() {
  const { t } = useTranslation('common')
  const [filter, setFilter] = useQueryState('filter', rosterFilterQueryParser)
  const [keyword, setKeyword] = useQueryState('keyword', rosterKeywordQueryParser)
  const [createdByMe, setCreatedByMe] = useQueryState('created_by_me', rosterCreatedByMeQueryParser)
  const [sortBy] = useQueryState('sort_by', rosterSortByQueryParser)
  const { data: profile } = useQuery(userProfileQueryOptions())
  const router = useRouter()
  const workspaceId = useAtomValue(currentWorkspaceIdAtom)
  const path = usePathname()
  const teamId = path.split('/')[2] || ''
  const [teams, setTeams] = useState<Team[]>([])
  const visibleTeams = selectTeams(teams, {
    filter,
    keyword,
    createdByMe,
    sortBy,
    userId: profile?.profile.id,
  })
  const publishedTeams = teams.filter((t) => !!t.published_id).length
  const [agents, setAgents] = useState<Agent[]>([])
  const [team, setTeam] = useState<Team | null>(null)
  const [form, setForm] = useState<Config>(blank)
  const [creating, setCreating] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string>()
  const search = useSearchParams()
  const [tab, setTab] = useState(
    ['config', 'preview', 'access', 'logs', 'monitor'].includes(search.get('tab') || '')
      ? search.get('tab')!
      : 'config',
  )
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useDocumentTitle(team ? `${team.name} · Agent Teams` : 'Agent Teams')

  const message = async (e: unknown) => {
    if (e instanceof Response) {
      const d = await e.json().catch(() => ({}))
      return d.message || '操作失败，请刷新核对状态'
    }
    return e instanceof Error ? e.message : '操作失败，请刷新核对状态'
  }
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
    } catch (e) {
      setError(await message(e))
    } finally {
      setBusy(false)
    }
  }
  const load = useCallback(async () => {
    if (teamId) {
      const d = await get<{ team: Team; agents: Agent[] }>(`${base}/${teamId}`)
      setTeam(d.team)
      setForm(d.team.config)
      setAvatarPreview(d.team.avatar_url)
      setAgents(d.agents)
    } else {
      const d = await get<{ teams: Team[]; agents: Agent[] }>(base)
      setTeams(d.teams)
      setAgents(d.agents)
      setTeam(null)
    }
  }, [teamId])
  useEffect(() => {
    let alive = true
    load()
      .catch(async (e) => {
        if (alive) setError(await message(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [load])
  const patch = <K extends keyof Config>(key: K, value: Config[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const member = (index: number, key: keyof Member, value: string) =>
    patch(
      'members',
      form.members.map((m, i) => (i === index ? { ...m, [key]: value } : m)),
    )
  const dirty = !!team && JSON.stringify(form) !== JSON.stringify(team.config)
  const save = async () => {
    if (team) {
      await post(`${base}/${teamId}`, { body: { ...form, revision: team.revision } })
      await load()
      setNotice('草稿已保存，正式调用仍使用已发布版本。')
    } else {
      const result = await post<Team>(base, { body: form })
      router.push(`${base}/${result.id}`)
    }
  }
  const agentOptions = (
    <>
      <option value="">请选择已发布的 Agent</option>
      {agents.map((a) => (
        <option value={a.id} key={a.id}>
          {a.name}
        </option>
      ))}
    </>
  )
  const [taskGoal, division] = splitGoal(form.goal)
  const updateGoal = (task: string, work: string) =>
    patch('goal', work ? `${task}${divisionMarker}${work}` : task)
  const configForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void act(save)
      }}
      className={styles.form}
    >
      <div className={styles.card}>
        <h2>团队任务</h2>
        <TeamAvatarEditor
          value={form.avatar}
          url={avatarPreview}
          disabled={busy}
          onChange={(avatar, url) => {
            patch('avatar', avatar)
            setAvatarPreview(url)
          }}
        />
        <label>
          团队名称
          <input
            value={form.name}
            maxLength={80}
            required
            onChange={(e) => patch('name', e.target.value)}
            placeholder="例如：客户经营专家团"
          />
        </label>
        <label>
          这个团队帮你做什么
          <textarea
            rows={4}
            value={taskGoal}
            required
            maxLength={6000 - (division ? divisionMarker.length + division.length : 0)}
            onChange={(e) => updateGoal(e.target.value, division)}
            placeholder="例如：根据客户需求，整理产品建议、技术待确认事项和下一步跟进计划。"
          />
        </label>
      </div>
      <div className={styles.card}>
        <h2>分工方式</h2>
        <p>告诉团长：谁负责什么，专家先一起分析还是按顺序接力。</p>
        <label>
          团长如何安排专家（选填）
          <textarea
            rows={5}
            value={division}
            maxLength={Math.max(0, 6000 - taskGoal.length - divisionMarker.length)}
            onChange={(e) => updateGoal(taskGoal, e.target.value)}
            placeholder="例如：产品专家推荐产品，技术专家分析部署要求，销售专家提出跟进建议。团长检查各方意见后整理成一份答案。"
          />
        </label>
      </div>
      <div className={styles.card}>
        <h2>最终答案要求</h2>
        <p>团长会合并重复内容，检查不同意见，再按这里的要求整理最终答案。</p>
        <label>
          你希望最终看到什么（选填）
          <textarea
            rows={6}
            value={form.output}
            maxLength={3000}
            onChange={(e) => patch('output', e.target.value)}
            placeholder="例如：按客户需求、产品建议、技术待确认事项、下一步行动输出。不确定的内容标记为待确认，并注明资料出处。"
          />
        </label>
      </div>
      <div className={styles.card}>
        <h2>团长</h2>
        <p>团长负责安排任务、检查专家意见，并整理成一份完整答案。这里使用所选 Agent 的模型。</p>
        <label>
          选择团长
          <select
            value={form.leader_id}
            required
            onChange={(e) => patch('leader_id', e.target.value)}
          >
            {agentOptions}
          </select>
        </label>
      </div>
      <div className={styles.card}>
        <div className={styles.row}>
          <h2>
            专家成员 <span className={styles.muted}>{form.members.length} / 8</span>
          </h2>
          <button
            type="button"
            disabled={form.members.length >= 8}
            onClick={() =>
              patch('members', [
                ...form.members,
                {
                  editor_key: crypto.randomUUID(),
                  agent_id: '',
                  responsibility: '',
                  input_hint: '',
                },
              ])
            }
          >
            ＋ 添加专家
          </button>
        </div>
        <p>
          专家复用自己的提示词、模型、Skills、知识库和工具。团长会按任务选择成员，并可安排独立任务并行执行。
        </p>
        {form.members.length === 0 && (
          <div className={styles.emptySmall}>添加至少一位专家，说明他负责的工作。</div>
        )}
        {form.members.map((m, i) => (
          <div className={styles.member} key={m.editor_key || m.agent_id}>
            <div className={styles.row}>
              <strong>专家 {i + 1}</strong>
              <button
                type="button"
                onClick={() =>
                  patch(
                    'members',
                    form.members.filter((_, index) => index !== i),
                  )
                }
              >
                移除
              </button>
            </div>
            <label>
              Agent
              <select
                value={m.agent_id}
                required
                onChange={(e) => member(i, 'agent_id', e.target.value)}
              >
                {agentOptions}
              </select>
            </label>
            <label>
              职责
              <textarea
                rows={2}
                value={m.responsibility}
                required
                maxLength={1000}
                placeholder="例如：核对客户现状、识别风险，并说明依据。"
                onChange={(e) => member(i, 'responsibility', e.target.value)}
              />
            </label>
            <label>
              输入说明（选填）
              <textarea
                rows={2}
                value={m.input_hint}
                maxLength={2000}
                placeholder="如果专家要求 JSON，写明 mode、必填字段及示例，团长据此构造输入。"
                onChange={(e) => member(i, 'input_hint', e.target.value)}
              />
            </label>
          </div>
        ))}
      </div>
      <div className={styles.card}>
        <h2>执行限制</h2>
        <div className={styles.limits}>
          {(
            [
              ['parallelism', '同时执行专家数', 1, 3],
              ['max_calls', '最多专家调用次数', 1, 12],
              ['max_rounds', '最多分工轮数', 1, 4],
              ['timeout', '执行时间上限（秒）', 30, 300],
            ] as const
          ).map(([key, title, min, max]) => (
            <label key={key}>
              {title}
              <input
                type="number"
                min={min}
                max={max}
                required
                value={form[key]}
                onChange={(e) => patch(key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <p>平台最多同时执行 2 个团队任务、4 个 Agent 调用。成员只可来自当前工作空间。</p>
      </div>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={busy || !form.members.length}>
          {busy ? '保存中…' : team ? '保存草稿' : '创建团队'}
        </button>
        {!team && (
          <button type="button" onClick={() => setCreating(false)}>
            取消
          </button>
        )}
      </div>
    </form>
  )
  return (
    <div className={teamId ? styles.detailShell : styles.listShell}>
      {teamId && (
        <aside className={styles.detailSidebar} aria-label="当前专家团">
          <Link className={styles.detailBack} href={base}>
            ← Agent Teams
          </Link>
          <div className={styles.detailIdentity}>
            <span aria-hidden>
              <TeamAvatar value={form.avatar} url={avatarPreview} small />
            </span>
            <div>
              <strong>{team?.name || '正在加载团队…'}</strong>
              <span>专家团队</span>
            </div>
          </div>
          <nav className={styles.detailNav} aria-label="专家团导航">
            {(
              [
                ['config', '配置'],
                ['preview', '运行与预览'],
                ['access', '访问点'],
                ['logs', '运行日志'],
                ['monitor', '监控'],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? styles.active : ''}
                aria-current={tab === id ? 'page' : undefined}
                disabled={id === 'preview' && (dirty || busy)}
                title={
                  id === 'preview'
                    ? dirty
                      ? '请先保存草稿'
                      : '在新网页调试已保存的草稿'
                    : undefined
                }
                onClick={() => {
                  if (id === 'preview')
                    window.open(
                      teamRunUrl(teamId, 'preview', workspaceId),
                      '_blank',
                      'noopener,noreferrer',
                    )
                  else setTab(id)
                }}
              >
                <span
                  aria-hidden
                  className={`${styles.navIcon} ${{ config: 'i-ri-settings-3-line', preview: 'i-ri-external-link-line', access: 'i-ri-links-line', logs: 'i-ri-file-list-2-line', monitor: 'i-ri-dashboard-line' }[id]}`}
                />
                {title}
                {id === 'preview' && (
                  <span aria-hidden className="ml-1 i-ri-external-link-line inline-block size-3" />
                )}
              </button>
            ))}
          </nav>
        </aside>
      )}
      <main className={styles.root}>
        <div
          className={styles.header}
          style={!teamId && !creating ? { marginBottom: 16 } : undefined}
        >
          <div>
            <h1>{team?.name || 'Agent Teams'}</h1>
            {(teamId || creating) && (
              <p>
                {team
                  ? '让团长组织专家，分工执行，共同完成任务。'
                  : '组建专家团队，复用已有 Agent，让团长自主规划、分工和汇总。'}
              </p>
            )}
          </div>
          {team ? (
            <div className={styles.actions}>
              <span className={styles.badge}>
                {team.published_id
                  ? `已发布 v${team.versions?.find((v) => v.id === team.published_id)?.version || ''}`
                  : '未发布'}
              </span>
              <button
                className={styles.primary}
                disabled={busy || dirty}
                title={dirty ? '请先保存草稿' : '固定团队和成员的当前发布版本'}
                onClick={() =>
                  void act(async () => {
                    await post(`${base}/${teamId}/publish`, { body: { revision: team.revision } })
                    await load()
                    setNotice('团队已发布，团队配置及所有成员版本已固定。')
                  })
                }
              >
                发布团队
              </button>
            </div>
          ) : null}
        </div>
        {!teamId && !creating && (
          <TeamListToolbar
            draftAgents={teams.length - publishedTeams}
            publishedAgents={publishedTeams}
            disabled={loading || !agents.length}
            onCreate={() => {
              setForm(blank)
              setCreating(true)
            }}
          />
        )}

        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className={styles.notice}>
            {notice}
          </div>
        )}
        {loading ? (
          <div className={styles.empty}>正在加载团队…</div>
        ) : team ? (
          <>
            {tab === 'config' && (
              <>
                {dirty && <p className={styles.muted}>有尚未保存的修改。保存后再发布或预览。</p>}
                {configForm}
              </>
            )}
            {tab === 'preview' && (
              <div className={styles.card}>
                <h2>独立网页运行与预览</h2>
                <p>
                  在独立对话页面查看任务结果和专家协作过程。草稿调试使用已保存配置，正式运行使用已发布版本。
                </p>
                <div className={styles.actions}>
                  <button
                    disabled={dirty || busy}
                    onClick={() =>
                      window.open(
                        teamRunUrl(teamId, 'preview', workspaceId),
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    打开草稿调试
                  </button>
                  <button
                    disabled={!team.published_id}
                    onClick={() =>
                      window.open(
                        teamRunUrl(teamId, 'published', workspaceId),
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    启动已发布版本
                  </button>
                </div>
              </div>
            )}
            {tab === 'access' && <TeamAccess team={team} />}
            {tab === 'logs' && <TeamLogs teamId={teamId} />}
            {tab === 'monitor' && <TeamMonitoring teamId={teamId} />}
          </>
        ) : creating ? (
          configForm
        ) : teams.length && !visibleTeams.length ? (
          <div className={styles.empty} role="status">
            <p>{t(($) => $['operation.noSearchResults'], { content: 'Agent Teams' })}</p>
            <button
              onClick={() => {
                void setFilter('all')
                void setKeyword('')
                void setCreatedByMe(false)
              }}
            >
              {t(($) => $['operation.reset'])}
            </button>
          </div>
        ) : teams.length ? (
          <div className={styles.grid}>
            {visibleTeams.map((t) => (
              <article className={styles.teamCard} key={t.id}>
                <TeamActions team={t} onChanged={load} />
                <Link href={`${base}/${t.id}`} className={styles.cardLink}>
                  <div className={styles.teamIcon}>
                    <TeamAvatar value={t.config.avatar} url={t.avatar_url} />
                  </div>
                  <h2>{t.name}</h2>
                  <p>{t.config.description || t.config.goal}</p>
                  <div className={styles.row}>
                    <span>{t.config.members.length} 位专家</span>
                    <span className={styles.badge}>
                      {t.published_id ? `已发布 v${t.published_version}` : '草稿'}
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h2>组建你的第一个专家团队</h2>
            <p>选择一位团长和几位专家，说明目标，由团长安排任务并汇总答案。</p>
            <p>例如：客户分析专家 ＋ 风险识别专家 → 客户经营建议。</p>
            <button
              className={styles.primary}
              disabled={!agents.length}
              onClick={() => {
                setForm(blank)
                setCreating(true)
              }}
            >
              创建团队
            </button>
            {!agents.length && <p>当前工作空间还没有已发布的 Agent，请先创建并发布 Agent。</p>}
          </div>
        )}
      </main>
    </div>
  )
}

export default function AgentTeamsPage() {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom)
  const path = usePathname()
  return <TeamContent key={`${workspaceId}:${path}`} />
}
