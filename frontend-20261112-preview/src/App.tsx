import { PageMarkContext } from '@/components/page-mark'
import { DeviceAuthorization } from '@/pages/DesktopDevice'
import {getPermissions} from '@/api/access'
import {setPermissions,useSession} from '@/lib/session'
import {DemoFrame} from '@/components/demo-frame'
import {PageSearch} from '@/components/page-search'
import {isDemoPath} from '@/lib/feature-modes'
import ApplicationOperations, { ApplicationAuthorization } from '@/pages/ApplicationOperations'
import MyReleases from '@/pages/my-releases'
import Approvals from '@/pages/admin/approvals'
import Org from '@/pages/admin/org'
import Admins from '@/pages/admin/admins'
import Spaces from '@/pages/admin/spaces'
import Audit from '@/pages/admin/audit'
import Review from '@/pages/Review'
import { getAccountProfile } from '@/api/settings'
import { currentUser as me } from '@/lib/current-user'
import Assistant from '@/pages/Assistant'
import Config from '@/pages/Config'
import KnowledgeModule from '@/pages/knowledge'
import { MotionConfig } from 'motion/react'
import { Component, useEffect, useState } from 'react'
import type { Route } from '@/components/shell'
import { Sidebar,TopBar,canSeeAdmin,navItemFor } from '@/components/shell'

import { ToastProvider } from '@/components/ui/toast'
import { TipProvider } from '@/components/ui/tooltip'
import { useTheme } from '@/lib/theme'
import AgentsModule from '@/pages/agents'
import Collab from '@/pages/Collab'
import IntegrationsModule from '@/pages/integrations'
import Login from '@/pages/Login'
import LiveSkills from '@/pages/LiveSkills'
import TeamsModule from '@/pages/teams'

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return <div className="relative z-10 grid h-full place-items-center p-8"><div className="glass-3 w-full max-w-lg rounded-3xl p-6"><p className="text-lg font-semibold">页面暂时无法打开</p><p className="mt-2 text-sm text-ink-3">{this.state.error.message || '页面运行时出现异常。'}</p><div className="mt-4 flex gap-2"><button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => { this.setState({ error: null }); location.reload() }}>重新加载</button><button type="button" className="rounded-xl bg-volt px-3 py-2 text-sm text-black" onClick={() => { this.setState({ error: null }); location.hash = 'agents' }}>返回 Agents</button></div></div></div>
    }
    return this.props.children
  }
}

// 路由用 hash：#模块/对象/分区，例如 #agents、#agents/<id>/access、#integrations/tools、#kb/<id>
function readHash(): { route: Route, param?: string, sub?: string } {
  const [route, param, sub] = location.hash.slice(1).split('?')[0].split('/')
  const dec = (v?: string) => (v ? decodeURIComponent(v) : undefined)
  return { route: (route as Route) || 'login', param: dec(param), sub: dec(sub) }
}

export default function App() {
  const { theme } = useTheme()
  const {perms}=useSession()
  const [search,setSearch]=useState(false)
  const [{ route, param, sub }, setLoc] = useState(readHash)
  const path=[route,param,sub].filter(Boolean).join('/')
  const admin=route==='admin'
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const preserveAuthorization = () => { if ((location.hash.startsWith('#app-authorize?') || location.hash.startsWith('#device-authorize/')) && location.hash.length < 6000) sessionStorage.setItem('rx-authorization-return',location.hash) }
  const checkSession = async () => {
    setChecking(true)
    try { const p = await getAccountProfile(); Object.assign(me, {id:p.id, owner:p.name, role:p.email, avatar:p.avatar_url || me.avatar, status:''}); setPermissions(await getPermissions()); setAuthenticated(true); if (!location.hash || location.hash === '#login') { const back=sessionStorage.getItem('rx-authorization-return');sessionStorage.removeItem('rx-authorization-return');location.hash=(back?.startsWith('#app-authorize?') || back?.startsWith('#device-authorize/'))?back:'assistant' } }
    catch { preserveAuthorization(); setPermissions(null); setAuthenticated(false); if (!location.hash.startsWith('#login')) location.hash = 'login' }
    finally {setChecking(false)}
  }
  useEffect(() => { checkSession(); const expired = () => {preserveAuthorization(); setPermissions(null); setAuthenticated(false); location.hash = 'login'}; addEventListener('rx-session-expired', expired); return () => removeEventListener('rx-session-expired', expired) }, [])


  useEffect(() => {
    const on = () => setLoc(readHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(v=>!v) } };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [])
  const go = (path: string) => {
    location.hash = path
  }

  let page: React.ReactNode
  switch (route) {
    case 'assistant': page = <Assistant go={go} initialSessionId={param} />; break
    case 'config': page = <Config go={go} />; break
    case 'collab': page = <Collab theme={theme} initialGroupId={param} />; break
    case 'releases': page = <MyReleases go={go} />; break
    case 'app-integrations': page = <ApplicationOperations />; break
    case 'operations': page = <ApplicationOperations operations />; break
    case 'device-authorize': page = <DeviceAuthorization id={param || ''} />; break
    case 'app-authorize': page = <ApplicationAuthorization />; break
    case 'admin': page = !canSeeAdmin(path,perms)?<div role="alert" className="p-10">你没有此管理功能的权限。</div>:param==='apps'?<ApplicationOperations />:!param?<ApplicationOperations operations />:param==='org'?<Org />:param==='admins'?<Admins />:param==='spaces'?<Spaces />:param==='audit'?<Audit />:<Approvals id={sub} go={go} />; break
    case 'review': page = <Review go={go} />; break;
    case 'agents': page = <AgentsModule param={param} sub={sub} go={go} theme={theme} />; break
    case 'teams': page = <TeamsModule param={param} sub={sub} go={go} theme={theme} />; break
    case 'kb': page = <KnowledgeModule param={param} sub={sub} go={go} theme={theme} />; break
    case 'studio': page = <AgentsModule go={go} theme={theme} />; break
    case 'skills': page = <LiveSkills param={param} go={go} />; break
    case 'integrations': page = <IntegrationsModule param={param} sub={sub} go={go} theme={theme} />; break
    default: page = <Assistant go={go} initialSessionId={param} />
  }

  if(isDemoPath(path)&&(!admin||canSeeAdmin(path,perms)))page=<DemoFrame path={path} theme={theme}/>
  return (
    <MotionConfig reducedMotion="user">
      <TipProvider delay={300}>
        <ToastProvider>

          <AppErrorBoundary>
            {checking ? <div className="relative z-10 grid h-full place-items-center">正在验证账号…</div> : (!authenticated || route === 'login')
              ? <Login theme={theme} onEnter={checkSession} />
              : (
                  <div className="flex h-full flex-col bg-bg">
                    <TopBar admin={admin} go={go} onSearch={()=>setSearch(true)}/>
                    <div className="flex min-h-0 flex-1">
                      <Sidebar current={path} go={go} admin={admin}/>
                      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
                        <PageMarkContext.Provider value={navItemFor(path,admin)??null}><div key={isDemoPath(path)?'preview':`${route}/${param??''}`} className="contents">{page}</div></PageMarkContext.Provider>
                      </main>
                    </div>
                    <PageSearch open={search} onClose={()=>setSearch(false)} go={go}/>
                  </div>
                )}
          </AppErrorBoundary>
        </ToastProvider>
      </TipProvider>
    </MotionConfig>
  )
}
