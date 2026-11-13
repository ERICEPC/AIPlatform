import { useState } from 'react'
import { RiDownloadLine, RiExternalLinkLine, RiGithubFill, RiSearchLine } from '@remixicon/react'
import type { MarketCategory } from '@/api/skills'
import { Button } from '@/components/ui/button'
import { Badge, Panel } from '@/components/ui/primitives'
import { SpotlightCard } from '@/components/ui/effects'
import { CATEGORY, CATEGORY_ORDER, IconTile } from './shared'
import { cn } from '@/lib/cn'

export type MarketEntry = {name:string;description:string;category:MarketCategory;readme:string;url:string;sha256:string;size:number;files:number;missing:string[]}
const preferred = ['sn-image-doctor','sn-image-base','sn-infographic','sn-image-imitate','sn-image-resume','sn-ppt-entry','sn-ppt-story','sn-ppt-standard','sn-ppt-dazzle','sn-ppt-creative','sn-ppt-doctor','sn-ppt-tools','sn-ppt-workbench']
const tags: Record<string,string> = {'sn-image-doctor':'环境诊断','sn-image-base':'图像基础层（Tier 0）','sn-infographic':'信息图生成（Tier 1）','sn-image-imitate':'图像风格仿（Tier 1）','sn-image-resume':'简历图片生成（Tier 1）','sn-ppt-entry':'PPT 入口','sn-ppt-story':'PPT 编排','sn-ppt-standard':'PPT 标准模式','sn-ppt-dazzle':'PPT 动态模式','sn-ppt-creative':'PPT 创意模式','sn-ppt-doctor':'PPT 环境诊断','sn-ppt-tools':'Bundled 工具回退','sn-ppt-workbench':'PPT 编辑工作台'}

export default function LiveMarket({catalog,keyword,onKeyword,installed,busy,disabled,onInstall,onDetail}:{
 catalog?:{revision:string;skills:MarketEntry[]};keyword:string;onKeyword:(value:string)=>void;
 installed:Set<string>;busy:string;disabled:boolean;onInstall:(s:MarketEntry)=>void;onDetail:(s:MarketEntry)=>void;
}) {
 const [category,setCategory]=useState<MarketCategory|'all'>('all')
 const entries=catalog?.skills??[]
 const shown=entries.filter(s=>(category==='all'||s.category===category)&&`${s.name} ${s.description} ${tags[s.name]||CATEGORY[s.category].label}`.toLowerCase().includes(keyword.toLowerCase())).sort((a,b)=>{
   const rank=(s:MarketEntry)=>preferred.includes(s.name)?preferred.indexOf(s.name):100+CATEGORY_ORDER.indexOf(s.category)
   return rank(a)-rank(b)||a.name.localeCompare(b.name)
 })
 return <div className="mt-6 space-y-5">
   <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3 text-xs text-ink-3">
     <span className="flex items-center gap-2"><RiGithubFill className="size-4"/>来源：<a href="https://github.com/OpenSenseNova/SenseNova-Skills" target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-volt-text">SenseNova-Skills</a></span>
     <span>固定版本 · 提交 <span className="font-mono">{catalog?.revision.slice(0,7)||'加载中'}</span></span>
     <span>遵循 Agent Skills 规范 · MIT 许可</span><span className="ml-auto">共 {entries.length} 个技能</span>
   </Panel>
   <div className="flex flex-wrap items-center gap-2" aria-label="技能市场筛选">
     {(['all',...CATEGORY_ORDER] as const).map(c=>{
       const count=c==='all'?entries.length:entries.filter(s=>s.category===c).length
       if(c!=='all'&&!count)return null
       const Icon=c==='all'?null:CATEGORY[c].icon
       return <button key={c} type="button" aria-pressed={category===c} onClick={()=>setCategory(c)} className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',category===c?'border-transparent bg-volt text-volt-ink':'border-line text-ink-2 hover:bg-hover')}>
         {Icon&&<Icon className="size-3.5"/>}{c==='all'?'全部':CATEGORY[c].label}<span className="opacity-60">{count}</span>
       </button>
     })}
     <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-full border border-line bg-glass-1 px-3 sm:w-60">
       <RiSearchLine className="size-4 shrink-0 text-ink-3"/><input aria-label="搜索市场技能" value={keyword} onChange={e=>onKeyword(e.target.value)} placeholder="搜索名称、标签或描述" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-ink-3"/>
     </label>
   </div>
   {!catalog?<p className="py-12 text-center text-ink-3">正在加载技能目录…</p>:!shown.length?<p className="py-12 text-center text-ink-3">没有匹配的技能，试试其他关键词或分类。</p>:<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
     {shown.map(s=>{const info=CATEGORY[s.category];return <SpotlightCard key={s.name}>
       <article className="flex h-[224px] min-w-0 flex-col p-5">
         <button type="button" onClick={()=>onDetail(s)} className="flex min-w-0 items-start gap-3 text-left">
           <IconTile icon={info.icon} tone={info.tone} size={42}/><div className="min-w-0 flex-1"><h2 title={s.name} className="truncate font-mono text-sm font-semibold">{s.name}</h2><Badge tone="cyan" className="mt-1 max-w-full truncate">{tags[s.name]||info.label}</Badge></div>
         </button>
         <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{s.description}</p>
         <div className="mt-auto flex items-center justify-between gap-2 pt-4">
           <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-ink-3 hover:text-volt-text">在 GitHub 查看<RiExternalLinkLine className="size-3"/></a>
           {installed.has(s.name)?<Badge tone="mint">已安装</Badge>:<Button size="small" variant="primary" disabled={disabled||!!busy||!!s.missing.length} onClick={()=>onInstall(s)}><RiDownloadLine className="size-3.5"/>{busy===s.name?'安装中…':s.missing.length?'依赖缺失':'安装'}</Button>}
         </div>
       </article>
     </SpotlightCard>})}
   </div>}
 </div>
}
