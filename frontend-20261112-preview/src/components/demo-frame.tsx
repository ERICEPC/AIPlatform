import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/session'
import { demoNames } from '@/lib/feature-modes'

export function DemoFrame({path,theme}:{path:string;theme:string}) {
 const {perms}=useSession()
 const frame=useRef<HTMLIFrameElement>(null)
 const latest=useRef({path,theme})
 latest.current={path,theme}
 // Keep one sandbox document while switching preview modules. Only its hash changes.
 const [src]=useState(()=>`/v4-demo/nov12/?role=${encodeURIComponent(perms?.role||'developer')}&theme=${theme}#${path}`)
 const [loading,setLoading]=useState(true)
 const name=demoNames[path.startsWith('admin/')?path.split('/')[1]:path.split('/')[0]]||'功能预览'
 const sendRoute=()=>frame.current?.contentWindow?.postMessage({type:'rx-preview-route',...latest.current},'*')
 useEffect(()=>{sendRoute()},[path,theme])
 useEffect(()=>{
  // The sandbox has an opaque origin. Trust only this exact iframe window.
  const onMessage=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow)return
   if(event.data?.type==='rx-preview-ready'){setLoading(false);sendRoute();return}
   if(event.data?.type==='rx-preview-navigate' && ['assistant','config'].includes(event.data.path))location.hash=event.data.path
  }
  addEventListener('message',onMessage)
  return()=>removeEventListener('message',onMessage)
 },[])
 return <section className="relative flex min-h-0 flex-1 flex-col">{loading&&<div role="status" className="absolute top-16 left-6 text-sm text-ink-3">正在打开功能预览…</div>}<iframe ref={frame} title={`${name}（功能演示）`} className="min-h-0 w-full flex-1 border-0" sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" src={src}/></section>
}
