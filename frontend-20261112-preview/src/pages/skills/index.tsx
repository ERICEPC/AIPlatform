import type { Go, SkillTab } from './shared'
import { RiApps2Line, RiFolderUserLine, RiStore2Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { Page, Rise } from '@/components/page'
import { Segmented } from '@/components/ui/segmented'
import LocalTab from './local'
import MarketTab from './market'
import NativeTab from './native'
import { panelVariants, TABS } from './shared'

export type ModuleProps = { param?: string, sub?: string, go: Go, theme: 'dark' | 'light' }

const INTRO: Record<SkillTab, string> = {
  native: '平台内置的基础办公能力，始终启用，助手和 Agent 可以直接调用。',
  local: '你自己的技能：上传 SKILL.md / 技能包，或从 GitHub 导入；从市场安装的也在这里管理。',
  market: '挑选 SenseNova 官方技能安装到本地，默认不预装，按需取用。',
}

// 路由：#skills（= 原生）、#skills/native|local|market、#skills/<tab>/<skillId> 打开详情抽屉
export default function SkillsModule({ param, sub, go }: ModuleProps) {
  const tab: SkillTab = TABS.includes(param as SkillTab) ? (param as SkillTab) : 'native'
  const detail = TABS.includes(param as SkillTab) ? sub : undefined
  const open = (id?: string) => go(id ? `skills/${tab}/${encodeURIComponent(id)}` : `skills/${tab}`)

  return (
    <Page className="overflow-auto">
      <div className="px-10 pt-10 pb-16">
        <Rise className="flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.035em]">Skills</h1>
            <p className="mt-3 text-[14.5px] text-ink-2">给助手和 Agent 加能力。每个技能是一个带 SKILL.md 的目录，写明什么时候用、怎么用。</p>
          </div>
        </Rise>

        <Rise className="mt-8 flex flex-wrap items-center gap-3">
          <Segmented
            value={tab}
            onValueChange={v => go(`skills/${v}`)}
            aria-label="技能分类"
            options={[
              { value: 'native', label: <span className="flex items-center gap-1.5"><RiApps2Line className="size-4" />原生</span> },
              { value: 'local', label: <span className="flex items-center gap-1.5"><RiFolderUserLine className="size-4" />本地</span> },
              { value: 'market', label: <span className="flex items-center gap-1.5"><RiStore2Line className="size-4" />市场</span> },
            ]}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={tab} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="text-[13px] text-ink-3">
              {INTRO[tab]}
            </motion.p>
          </AnimatePresence>
        </Rise>

        <AnimatePresence mode="wait">
          <motion.div key={tab} variants={panelVariants} initial="initial" animate="enter" exit="exit" className="mt-6">
            {tab === 'native' && <NativeTab detail={detail} open={open} go={go} />}
            {tab === 'local' && <LocalTab detail={detail} open={open} go={go} />}
            {tab === 'market' && <MarketTab detail={detail} open={open} go={go} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Page>
  )
}
