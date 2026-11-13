import { TeamDetail } from './detail'
import { TeamsList } from './list'

export type ModuleProps = { param?: string, sub?: string, go: (path: string) => void, theme: 'dark' | 'light' }

/*
  Agent Teams 模块入口。路由：
  #teams                         列表
  #teams/<id>                    成员（默认）
  #teams/<id>/<members|run|access|logs|monitoring>
  旧地址 #teams/<id>/orchestrate 会被替换为 #teams/<id>/members
*/
export default function TeamsModule({ param, sub, go }: ModuleProps) {
  return param ? <TeamDetail id={param} sub={sub} go={go} /> : <TeamsList go={go} />
}
