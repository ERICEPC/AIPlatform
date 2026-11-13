import { login, setupStatus, initStatus, validateInit, setupAdmin } from '@/api/auth'
import { API_MODE } from '@/api/http'
import { partnerAuthStatus } from '@/api/governance'
import { demoAccounts, recordLogin, signIn } from '@/api/mock/governance'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { useEffect } from 'react'
import { RiArrowRightLine, RiLockLine, RiMailLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { lazy, Suspense, useState } from 'react'
import raccoonPeek from '@/assets/raccoon-peek.png'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/primitives'
import { ease } from '@/lib/motion'

const AgentConstellation = lazy(() => import('@/three/AgentConstellation'))

const fade = (d: number) => ({ initial: { opacity: 0, y: 18, filter: 'blur(8px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.8, ease: ease.out, delay: d } })

function Field({ icon: Icon, label, type = 'text', placeholder, name }: { icon: React.ComponentType<{ className?: string }>, label: string, type?: string, placeholder: string, name: string }) {
  return (
    <label className="group block">
      <span className="mb-1.5 block text-[12.5px] text-ink-2">{label}</span>
      <span className="flex h-12 items-center gap-2.5 rounded-2xl border border-line-strong bg-hover px-4 transition-[border-color,box-shadow] duration-200 focus-within:border-volt focus-within:shadow-glow-volt">
        <Icon className="size-[18px] text-ink-3 transition-colors group-focus-within:text-volt-text" />
        <input name={name} required type={type} placeholder={placeholder} className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3" />
      </span>
    </label>
  )
}

/* 搭在卡片上沿的小爪子：深灰绒面 + 三个趾头，和吉祥物的手同色 */
function Paw({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute z-20 h-[22px] w-[34px] ${className}`}>
      <span
        className="absolute inset-0 rounded-[50%_50%_44%_44%/62%_62%_38%_38%]"
        style={{ background: 'radial-gradient(circle at 50% 28%, #5d5f64, #2a2b2e 72%)', boxShadow: '0 4px 8px rgb(0 0 0 / 0.45), inset 0 1px 1px rgb(255 255 255 / 0.22)' }}
      />
      {[6, 14, 22].map(x => (
        <span key={x} className="absolute -top-[3px] size-[9px] rounded-full" style={{ left: x, background: 'radial-gradient(circle at 45% 35%, #6a6c71, #2e2f33 75%)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.4)' }} />
      ))}
    </span>
  )
}

export default function Login({ theme, onEnter }: { theme: 'dark' | 'light', onEnter: () => void }) {
  const [stage, setStage] = useState('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'password' | 'sso'>(API_MODE === 'mock' ? 'password' : 'sso')
  const [ssoError, setSsoError] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('sso_error') ?? '')
  /* 企业统一身份：服务端（BFF）发起 OIDC 授权码 + PKCE，回调后写入控制台会话再跳回来 */
  const sso = async () => {
    setBusy(true); setSsoError('')
    try {
      if (API_MODE === 'mock') throw new Error('演示模式未接入统一身份，请使用下方演示账号')
      const s = await partnerAuthStatus()
      if (!s.configured) throw new Error('统一身份未配置，请联系管理员配置 PARTNER_AUTH_* 后重试；开发环境可用账号密码登录')
      location.href = `${import.meta.env.VITE_API_BASE ?? '/console/api'}/auth/partner/login?redirect_url=${encodeURIComponent(`${location.pathname}#assistant`)}`
    } catch (e) { setSsoError((e as Error).message); setBusy(false) }
  }
  const enterDemo = (id: string) => { signIn(id); recordLogin(); onEnter() }
  useEffect(() => { if (API_MODE === 'mock') { setStage('login'); return } setupStatus().then(async s => { setStage(s.step === 'finished' ? 'login' : (await initStatus()).status === 'finished' ? 'setup' : 'init') }).catch(e => {setError(e.message); setStage('error')}) }, [])
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError('')
    const f = new FormData(e.currentTarget)
    try {
      if (stage === 'init') { await validateInit(String(f.get('password'))); setStage('setup') }
      else if (stage === 'setup') { await setupAdmin(String(f.get('email')), String(f.get('name')), String(f.get('password'))); setStage('login') }
      else { const result = await login(String(f.get('email')), String(f.get('password')), f.get('remember') === 'on'); if (result.result !== 'success') throw new Error(result.message || '登录失败'); onEnter() }
    } catch (e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  return (
    <div className="relative z-10 grid h-full grid-cols-[1.25fr_1fr] overflow-hidden">
      {/* 左栏：上半部分是 3D 协同星座，下半部分是文案；星座只在左栏，不压登录卡片 */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 bottom-[22%] [mask-image:linear-gradient(to_bottom,#000_62%,transparent),linear-gradient(to_right,#000_80%,transparent)] [mask-composite:intersect]">
          <Suspense fallback={null}>
            <AgentConstellation theme={theme} />
          </Suspense>
        </div>

        <div className="pointer-events-none relative flex h-full flex-col justify-between p-12">
          <motion.div {...fade(0)} className="logo-mark h-10 w-56" role="img" aria-label="Raccoon X 浣星智能体中台" />
          <div>
            <motion.h1 {...fade(0.15)} className="text-[52px] leading-[1.06] font-semibold tracking-[-0.035em]">
              让每个人的助手
              <br />
              <span className="text-gradient">协同工作</span>
            </motion.h1>
            <motion.p {...fade(0.3)} className="mt-4 max-w-[460px] text-[15.5px] leading-relaxed text-ink-2">
              Raccoon X 为每位成员配备个人助手。助手之间互相委派、协作、交付，关键结果由人来把关。
            </motion.p>
            <motion.p {...fade(0.6)} className="mt-10 text-[12px] text-ink-3">© 2026 SenseTime FDE · 浣星智能体中台</motion.p>
          </div>
        </div>
      </div>

      <div className="relative grid place-items-center p-10 pt-24">
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, ease: ease.out, delay: 0.25 }} className="relative w-full max-w-[420px]">
          {/* 小浣熊趴在卡片后面，只露出头和肩；素材里举起的手已擦掉，头部完整；两只爪子搭在卡沿上 */}
          <motion.img
            src={raccoonPeek}
            alt="Raccoon X 吉祥物小浣熊"
            className="pointer-events-none absolute -top-[98px] right-10 z-0 w-[184px]"
            style={{ transformOrigin: '50% 75%' }}
            animate={{ rotate: [0, -2.5, 0, 1.5, 0], y: [0, -2, 0, -1, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <Paw className="-top-[12px] right-[150px]" />
          <Paw className="-top-[12px] right-[84px] scale-x-[-1]" />

          <Panel level={3} radius="xl" glow="volt" className="z-10 p-9">
            <h2 className="text-[26px] font-semibold">{stage === 'init' ? '初始化工作台' : stage === 'setup' ? '创建管理员' : '登录'}</h2>
            <p className="mt-2 text-[14px] text-ink-2">{stage === 'init' ? '输入部署时生成的初始化口令。' : stage === 'setup' ? '创建你的企业管理员账号。' : '欢迎回来，连接你的真实工作空间。'}</p>
            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-soft p-3 text-rose">{error}</p>}
            {stage === 'login' && <div role="tablist" aria-label="登录方式" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-hover p-1 text-[13.5px]">{([['sso', '企业统一身份'], ['password', API_MODE === 'mock' ? '演示账号' : '账号密码']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cn('h-9 cursor-pointer rounded-lg transition-colors', mode === k ? 'bg-solid font-semibold text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}>{l}</button>)}</div>}
            {stage === 'login' && mode === 'sso' ? <div className="mt-6 space-y-4">
              <p className="text-[13px] leading-6 text-ink-2">使用公司统一身份（Auth）登录。已有平台账号的同事：请先用账号密码登录，在左下角账号菜单中「绑定企业统一身份」，之后即可直接用统一身份登录。新同事首次登录会自动建立账号，部门由超级管理员分配。</p>
              {ssoError && <p role="alert" className="rounded-xl bg-rose-soft p-3 text-[13px] text-rose">{ssoError}</p>}
              <Button variant="primary" size="large" loading={busy} className="w-full" onClick={sso}>使用统一身份登录<RiArrowRightLine className="size-4" /></Button>
            </div> : stage === 'login' && API_MODE === 'mock' ? <div className="mt-6 space-y-2">
              <p className="text-[12.5px] text-ink-3">演示模式：选择一个账号进入，数据在本次浏览中共享，可随时在左下角切换账号。</p>
              {demoAccounts.map(a => <button key={a.id} type="button" onClick={() => enterDemo(a.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-hover p-3 text-left transition-colors hover:border-volt"><img src={asset(a.avatar)} alt="" className="size-9 rounded-full" /><span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{a.name}<span className="ml-2 text-[12px] font-normal text-ink-3">{a.title}</span></span><span className="block truncate text-[12px] text-ink-3">{a.hint}</span></span><RiArrowRightLine className="size-4 text-ink-3" /></button>)}
            </div> : stage === 'loading' ? <p className="py-8">正在连接服务…</p> : stage === 'error' ? <Button onClick={() => location.reload()}>重新连接</Button> : <form key={stage} className="mt-8 space-y-4" onSubmit={submit}>
              {stage !== 'init' && <Field name="email" icon={RiMailLine} label="邮箱" type="email" placeholder="name@company.com" />}
              {stage === 'setup' && <Field name="name" icon={RiMailLine} label="姓名" placeholder="你的姓名" />}
              <Field name="password" icon={RiLockLine} label={stage === 'init' ? '初始化口令' : '密码'} type="password" placeholder={stage === 'setup' ? '至少 8 位，包含字母和数字' : '输入密码或口令'} />
              {stage === 'login' && <label className="flex gap-2 text-ink-2"><input name="remember" type="checkbox" defaultChecked />保持登录</label>}
              <Button type="submit" variant="primary" size="large" loading={busy} className="w-full">{stage === 'init' ? '验证口令' : stage === 'setup' ? '创建管理员' : '进入工作台'}<RiArrowRightLine className="size-4" /></Button>
            </form>}
          </Panel>
        </motion.div>
      </div>
    </div>
  )
}
