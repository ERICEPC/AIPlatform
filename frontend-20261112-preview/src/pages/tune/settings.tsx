import { ConsolePage, PageHeader } from '@/components/console'
import { Button } from '@/components/ui/button'
import Config from '@/pages/Config'
import { TuneDesktop } from './desktop'
import { TuneExperts } from './experts'
import { TuneMemory } from './memory'
import { TuneRouter } from './router'
import { TuneSkills } from './skills'
const tabs = [{ id: 'router', label: '任务路由' }, { id: 'memory', label: '记忆策略' }, { id: 'skills', label: '技能设置' }, { id: 'experts', label: '专家调用' }, { id: 'desktop', label: '桌面与云端' }]
export default function AssistantSettings({ param, go }: { param?: string, go: (p: string) => void }) {
  if (!tabs.some(t => t.id === param)) return <Config go={go} />
  const settingsGo = (path: string) => go(path.startsWith('tune/') && path !== 'tune/suggestions' ? path.replace('tune/', 'config/') : path)
  return <ConsolePage header={<PageHeader title="助手配置" desc="配置个人助手的执行方式与资源；使用效果与问题复盘在个人智能体优化中查看。" tabs={tabs} tab={param!} onTab={t => go(`config/${t}`)} actions={<><Button onClick={() => go('config')}>基本设置</Button><Button onClick={() => go('tune')}>查看优化分析</Button></>} />}>
    {param === 'router' && <TuneRouter />}{param === 'memory' && <TuneMemory go={settingsGo} />}{param === 'skills' && <TuneSkills go={settingsGo} />}{param === 'experts' && <TuneExperts go={settingsGo} />}{param === 'desktop' && <TuneDesktop />}
  </ConsolePage>
}
