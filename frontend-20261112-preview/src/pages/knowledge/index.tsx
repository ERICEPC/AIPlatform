import { KnowledgeConnection } from './Connection'
import { Ask } from './Ask'
import { Reader } from './Reader'
import { Workbench } from './Workbench'

export type ModuleProps = { param?: string, sub?: string, go: (path: string) => void, theme: 'dark' | 'light' }

/*
  知识库模块入口（交互与导航沿用 Raccoon KnowledgeBase）：
    #kb                         找材料 · 我的（默认打开最近更新的个人库）
    #kb/all                     找材料 · 全部可访问
    #kb/<库 id>                  找材料（指定知识库；我的库默认归「我的」，带 ?scope=all 则留在全部可访问）
                                ?doc=<材料 id> 打开右侧「材料详情」
    #kb/<库 id | all>/reader?doc= 阅读器
    #kb/ask                      问材料；?doc= 问一份材料，?kb= 问一个知识库，?c= 打开历史会话
  管理端、对客分享管理等未移植的功能，在左栏「更多知识库功能」里跳到完整知识库。
*/
function KnowledgeRoutes({ param, sub, go }: ModuleProps) {
  if (param === 'ask')
    return <Ask go={go} />
  const libraryId = param && param !== 'all' ? param : ''
  if (sub === 'reader')
    return <Reader key={libraryId} libraryId={libraryId} go={go} />
  return <Workbench libraryId={libraryId} allView={!param || param === 'all'} go={go} />
}

export default function KnowledgeModule(props: ModuleProps) { return <KnowledgeConnection><KnowledgeRoutes {...props} /></KnowledgeConnection> }
