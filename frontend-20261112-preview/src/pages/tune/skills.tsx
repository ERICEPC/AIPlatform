import { RiAddLine, RiFlashlightLine } from '@remixicon/react'
import { useQuery } from '@/api/hooks'
import { listMySkills, toggleMySkill } from '@/api/tune'
import { Section } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Badge } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'

const SRC = { native: '原生', local: '本地安装', org: '组织共享', memory: '由记忆沉淀' } as const

/* 技能：个人助手用到的 Skill，看效果、启停，以及由记忆沉淀出的新 Skill */
export function TuneSkills({ go }: { go: (p: string) => void }) {
  const q = useQuery(listMySkills, [])
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <Section title="助手可用的技能" desc="稳定的做法写成 Skill，助手照着做，不再每次推理；Skill 包的安装与发布在「开发 · Skills」。" actions={<Button onClick={() => go('skills')}><RiAddLine className="size-4" />安装更多技能</Button>} bodyClass="p-0">
        {q.error && <div className="p-4"><ErrorBar error={q.error} onRetry={q.reload} /></div>}
        <table className="w-full text-[13px]">
          <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">技能</th><th className="w-[120px] px-3 font-medium">来源</th><th className="w-[80px] px-3 font-medium">版本</th><th className="w-[130px] px-3 font-medium">近 30 天</th><th className="w-[80px] px-3 font-medium">启用</th></tr></thead>
          <tbody>
            {(q.data?.data ?? []).map(s => (
              <tr key={s.id} className="border-t border-line align-top">
                <td className="px-5 py-3"><p className="flex items-center gap-2 font-medium"><RiFlashlightLine className="size-4 text-volt-text" />{s.name}</p><p className="mt-0.5 text-[12.5px] text-ink-3">{s.desc}</p>{s.note && <p className={cn('mt-1 text-[12.5px]', s.source === 'memory' ? 'text-volt-text' : 'text-amber')}>{s.note}</p>}</td>
                <td className="px-3 py-3"><Badge tone={s.source === 'memory' ? 'volt' : 'neutral'}>{SRC[s.source]}</Badge></td>
                <td className="px-3 py-3 text-ink-2">{s.version}</td>
                <td className="px-3 py-3 text-ink-2 tabular-nums">{s.uses_30d ? `${s.uses_30d} 次 · 成功 ${s.success}%` : '未使用'}</td>
                <td className="px-3 py-3"><Switch aria-label={`启用 ${s.name}`} checked={s.enabled} onCheckedChange={async v => { await toggleMySkill(s.id, v); q.reload() }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="记忆与技能怎么分工">
        <div className="grid grid-cols-2 gap-4 text-[13px] leading-relaxed text-ink-2 max-lg:grid-cols-1">
          <div className="rounded-lg bg-surface p-4"><p className="font-semibold text-ink">留在记忆</p><p className="mt-1">执行中仍需学习和优化的经验、个人偏好、有有效期的业务背景。</p></div>
          <div className="rounded-lg bg-surface p-4"><p className="font-semibold text-ink">沉淀为 Skill</p><p className="mt-1">已经稳定、无需反复推理的做法：固定步骤、输出格式、检查清单。沉淀后可以分享给团队或用于专家智能体。</p></div>
        </div>
      </Section>
    </div>
  )
}
