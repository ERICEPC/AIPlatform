import { PageHeader } from '@/components/console'
import { RiAddLine, RiArrowDownSLine, RiFileAddLine, RiUploadCloud2Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Page, Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Segmented } from '@/components/ui/segmented'
import { ease } from '@/lib/motion'
import { ImportDialog, InfoDialog } from './dialogs'
import EnterpriseTab, { asBuddy } from './enterprise'
import MineTab from './mine'

export type ListTab = 'enterprise' | 'mine'
export const LIST_TABS: ListTab[] = ['enterprise', 'mine']
const TAB_KEY = 'rx-agents-tab'

/** 上次选择的分组；默认「企服」 */
export function lastTab(): ListTab {
  try {
    const v = localStorage.getItem(TAB_KEY)
    return v === 'enterprise' ? 'enterprise' : 'mine'
  }
  catch {
    return 'mine'
  }
}
function rememberTab(t: ListTab) {
  try {
    localStorage.setItem(TAB_KEY, t)
  }
  catch {}
}

/** Agents 列表页：顶部分组「企服 / 我的」，路由 #agents/enterprise[/<buddy>]、#agents/mine */
export default function AgentList({ tab, sub, go }: { tab: ListTab, sub?: string, go: (path: string) => void }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [tick, setTick] = useState(0)

  // 直接打开 #agents/mine 等也记住，下次进 #agents 时恢复
  useEffect(() => rememberTab(tab), [tab])
  const switchTab = (t: ListTab) => go(`agents/${t}`)

  const createMenu = (
    <Menu
      trigger={<Button variant="primary" className="mb-0.5"><RiAddLine className="size-[18px]" />新建 Agent<RiArrowDownSLine className="-mr-1 size-4" /></Button>}
      items={[
        { label: '从空白创建', icon: RiFileAddLine, onSelect: () => setCreateOpen(true) },
        { label: '导入 DSL', icon: RiUploadCloud2Line, onSelect: () => setImportOpen(true) },
      ]}
    />
  )

  return (
    <Page className="overflow-auto">
      <PageHeader title="智能体" desc={tab === 'enterprise' ? '企业统一提供的业务助手，开箱即用。' : '创建和管理智能体，供个人助手、智能体协同以及 Web / API 调用。'} actions={tab === 'mine' ? createMenu : undefined}/>
      <div className="px-6 pb-10">
        <Rise className="mt-5">
          <Segmented
            value={tab}
            onValueChange={switchTab}
            aria-label="Agent 分组"
            options={[
              { value: 'enterprise', label: '企服' },
              { value: 'mine', label: '我的' },
            ]}
          />
        </Rise>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: ease.out }}>
            {tab === 'enterprise'
              ? <EnterpriseTab buddy={asBuddy(sub)} go={go} />
              : <MineTab go={go} tick={tick} onCreate={() => setCreateOpen(true)} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <InfoDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" onDone={a => go(`agents/${a.id}/configure`)} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => setTick(t => t + 1)} />
    </Page>
  )
}
