import { isSuper } from '@/api/access'
import { useSession } from '@/lib/session'
import { AdminsPage } from './admins'
import { AppsPage } from './apps'
import { ApprovalsPage } from './approvals'
import { AuditPage } from './audit'
import { OrgPage } from './org'
import { OverviewPage } from './overview'
import { SpacesPage } from './spaces'
import { StackPage } from './stack'

/*
  管理后台。路由：#admin · #admin/approvals[/<id>] · #admin/org · #admin/admins · #admin/spaces[/<id>]
  · #admin/apps[/<id>] · #admin/stack[/<component>] · #admin/audit
  普通管理员只看到管理范围内的数据；技术栈组件只读。超级管理员拥有全部权限。
*/
export default function AdminModule({ param, sub, go }: { param?: string, sub?: string, go: (p: string) => void }) {
  const { perms } = useSession()
  const sup = isSuper(perms)
  switch (param) {
    case 'approvals': return <ApprovalsPage id={sub} go={go} />
    case 'org': return <OrgPage />
    case 'admins': return <AdminsPage canEdit={sup} />
    case 'spaces': return <SpacesPage id={sub} go={go} />
    case 'apps': return <AppsPage canEdit={sup} id={sub} go={go} />
    case 'stack': return <StackPage id={sub} go={go} canEdit={sup} />
    case 'audit': return <AuditPage />
    default: return <OverviewPage go={go} />
  }
}
