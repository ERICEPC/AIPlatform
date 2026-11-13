import { snakeLivePreview } from './snake-preview'
import { useState } from 'react'
import { RiRefreshLine, RiExpandDiagonalLine, RiExternalLinkLine } from '@remixicon/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

export function DevelopmentPreview({ name }: { name: string }) {
  const [device,setDevice]=useState('desktop')
  const [url,setUrl]=useState('')
  const [address,setAddress]=useState('')
  const [error,setError]=useState('')
  const [revision,setRevision]=useState(0)
  const [expanded,setExpanded]=useState(false)
  const [settings,setSettings]=useState(false)
  const escaped=name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  const document=`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f6f8fc;color:#19243a;font:14px system-ui}header{background:white;border-bottom:1px solid #e4e9f1;padding:18px 24px;font-weight:650;display:flex;justify-content:space-between}small{color:#8592a6;font-weight:400}main{padding:28px;max-width:1100px;margin:auto}h1{font-size:23px;margin:0 0 8px}p{color:#7b879a;font-size:13px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:24px 0}.card{background:white;border:1px solid #e4e9f1;border-radius:8px;padding:20px}.card b{display:block;font-size:26px;margin-top:12px}.list{background:white;border:1px solid #e4e9f1;border-radius:8px;overflow:hidden}.row{padding:17px 20px;border-bottom:1px solid #edf0f5;display:flex;justify-content:space-between;gap:12px}.row:last-child{border:0}span.tag{font-size:11px;color:#2962e8;background:#edf3ff;padding:4px 8px;border-radius:4px}button{border:1px solid #dae1ec;background:white;border-radius:5px;padding:6px 12px;color:#2962e8;cursor:pointer}@media(max-width:500px){main{padding:18px}.metrics{grid-template-columns:1fr}.card{padding:12px}.card b{font-size:21px}small{display:none}}</style><header>${escaped}<small>产品原型 · 示例数据</small></header><main><h1>项目工作台</h1><p>集中查看任务进展与交付状态</p><div class="metrics"><div class="card">进行中的项目<b>12</b></div><div class="card">本周已完成<b>28</b></div><div class="card">待处理任务<b>8</b></div></div><div class="list"><div class="row"><strong>当前任务</strong><span class="tag">本周</span></div><div class="row">需求梳理与方案确认<span class="tag">已完成</span></div><div class="row">工作台前端页面<button onclick="this.textContent=this.textContent==='标记完成'?'已完成':'标记完成'">标记完成</button></div><div class="row">接口联调与验收<span class="tag">待开始</span></div></div></main></html>`
  const connect=()=>{try{const parsed=new URL(address);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error();setUrl(parsed.href);setSettings(false);setError('');setRevision(r=>r+1)}catch{setError('请输入有效的 HTTP / HTTPS 预览地址。')}}
  const frame=(large=false)=><div className={cn('flex justify-center overflow-auto bg-hover/60 p-4',large?'h-[calc(100dvh-110px)]':'min-h-0 flex-1')}><iframe key={revision+(large?1000:0)} title={`${name} 界面预览`} src={url||undefined} srcDoc={url?undefined:name.includes('贪吃蛇')?snakeLivePreview:document} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="h-full shrink-0 rounded-md border border-line bg-white shadow-sm transition-[width] duration-200" style={{width:device==='mobile'?375:device==='tablet'?768:'100%',maxWidth:'100%'}} /></div>
  return <section className="flex h-full min-h-[400px] flex-col overflow-hidden bg-solid">
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3"><span className="text-[11px] text-ink-3">{url?'运行地址':'本地预览'}</span><div className="ml-auto flex items-center gap-1"><Button size="small" variant="ghost" onClick={()=>setSettings(v=>!v)}>预览地址</Button>{[['desktop','桌面'],['tablet','平板'],['mobile','手机']].map(([id,label])=><Button key={id} size="small" variant={device===id?'secondary':'ghost'} onClick={()=>setDevice(id)}>{label}</Button>)}<Button size="icon-small" variant="ghost" aria-label="刷新预览" onClick={()=>setRevision(r=>r+1)}><RiRefreshLine className="size-4"/></Button><Button size="icon-small" variant="ghost" aria-label="放大预览" onClick={()=>{setDevice('desktop');setExpanded(true)}}><RiExpandDiagonalLine className="size-4"/></Button></div></div>
    {settings&&<form className="flex gap-2 border-b border-line p-3" onSubmit={e=>{e.preventDefault();connect()}}><Input aria-label="前端运行地址" className="min-w-0 flex-1 font-mono text-xs" value={address} onChange={e=>setAddress(e.target.value)} placeholder="输入沙箱或本地前端地址，例如 http://localhost:3000"/><Button size="small" type="submit">加载</Button>{url&&<Button size="small" onClick={()=>{setUrl('');setAddress('')}}>本地预览</Button>}</form>}
    {error&&<p role="alert" className="px-4 py-2 text-xs text-rose">{error}</p>}{frame()}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11px] text-ink-3"><span>{url?'需先启动目标前端服务；如站点限制嵌入，可在新窗口打开。':'当前为可交互的示例页面，并非实际生成的产品。'}</span>{url&&<a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-volt-text">新窗口打开<RiExternalLinkLine className="size-3"/></a>}</div>
    <Dialog open={expanded} onOpenChange={setExpanded} title="界面预览" size="screen">{frame(true)}</Dialog>
  </section>
}
