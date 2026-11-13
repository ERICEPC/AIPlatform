import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { request } from '@/api/http'
import { decideReview, type ReviewItem, type ReviewList } from '@/api/reviews'
import { Button } from '@/components/ui/button'

const detail=(id:string)=>request<ReviewItem>({method:'GET',path:`/reviews/${encodeURIComponent(id)}`},()=>{throw Error('确认需要连接真实服务')})

export function ReviewCard({item,onRefresh}:{item:ReviewItem;onRefresh:()=>void}) {
 const [mode,setMode]=useState<'edit'|'reject'|null>(null)
 const [content,setContent]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const lock=useRef(false)
 const clarification=item.kind==='clarification'
 const decide=async(decision:'approve'|'edit_approve'|'reject')=>{
  if(lock.current)return
  if(decision!=='approve'&&!content.trim()){setError(decision==='reject'?'请填写拒绝原因。':'请补充内容后继续。');return}
  lock.current=true;setBusy(true);setError('')
  try{await decideReview(item.id,decision,decision==='reject'?content:'',decision==='edit_approve'?content:'');setMode(null);setContent('');dispatchEvent(new Event('rx-review-updated'))}
  catch(e){setError((e as Error).message)}
  finally{lock.current=false;setBusy(false);onRefresh()}
 }
 const pending=item.status==='pending'
 const states={approved:'已确认',rejected:'已拒绝',superseded:'原任务已变化，此项无需处理',pending:'待你确认'}
 return <section aria-label="对话内人工确认" className="my-4 min-w-0 rounded-xl border border-volt/25 bg-solid p-4 text-sm">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{item.title}</h3><span className="text-xs text-ink-3">{states[item.status]}</span></div>
  <p className="mt-2 whitespace-pre-wrap break-words text-ink-2 [overflow-wrap:anywhere]">{item.edited_content||item.proposal}</p>
  {item.impact&&<p className="mt-2 text-xs leading-5 text-ink-3 [overflow-wrap:anywhere]">影响：{item.impact}</p>}
  {pending&&<>
   {(mode||clarification)&&<label className="mt-3 block text-xs text-ink-2">{mode==='reject'?'拒绝原因':clarification?'补充信息':'修改后的完整内容'}<textarea aria-label={mode==='reject'?'拒绝原因':'确认内容'} value={content} onChange={e=>setContent(e.target.value)} disabled={busy} rows={3} className="mt-2 w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-volt"/></label>}
   <div className="mt-3 flex flex-wrap gap-2">
    {mode==='reject'?<Button disabled={busy||!content.trim()} onClick={()=>void decide('reject')}>确认拒绝</Button>:<Button variant="primary" disabled={busy||((!!mode||clarification)&&!content.trim())} onClick={()=>void decide(mode==='edit'||clarification?'edit_approve':'approve')}>{busy?'正在提交…':clarification?'补充并继续':mode==='edit'?'保存并继续':'同意并继续'}</Button>}
    {!mode&&!clarification&&<Button disabled={busy} onClick={()=>{setContent(item.proposal);setMode('edit')}}>修改后继续</Button>}
    {!mode&&<Button variant="ghost" disabled={busy} onClick={()=>{setContent('');setMode('reject')}}>拒绝</Button>}
    {mode&&<Button variant="ghost" disabled={busy} onClick={()=>{setMode(null);setContent('');setError('')}}>取消</Button>}
   </div><p className="mt-2 text-xs text-ink-3">处理后在本对话继续，结果同步到“待我确认”。</p>
  </>}
  {!pending&&<p role="status" className="mt-3 text-xs text-ink-2">{item.execution_status==='queued'||item.execution_status==='running'?'已确认，正在原对话继续执行…':item.execution_status==='failed'?`继续执行未成功：${item.execution_error||'请检查原任务，系统不会自动重复执行。'}`:item.status==='rejected'?'已停止本次待确认操作。':item.execution_status==='succeeded'?'已回到原任务处理，请查看后续回复。':''}</p>}
  {error&&<p role="alert" className="mt-2 text-xs text-rose">{error}</p>}
 </section>
}
export function InlineReview({id}:{id:string}) {
 const [poll,setPoll]=useState(true)
 const q=useQuery(()=>detail(id),[id],{pollMs:poll?3000:false})
 useEffect(()=>{if(q.data)setPoll(q.data.status==='pending'||['queued','running'].includes(q.data.execution_status))},[q.data])
 if(!q.data)return <div className="my-4 text-sm text-ink-2">{q.error?<><span role="alert">无法读取确认事项：{q.error.message}</span><Button size="small" onClick={q.reload}>重试</Button></>:'正在读取确认事项…'}</div>
 return <ReviewCard key={id} item={q.data} onRefresh={q.reload}/>
}
export function ConversationReviews({contextId}:{contextId:string}) {
 const q=useQuery(()=>request<ReviewList>({method:'GET',path:'/reviews',query:{status:'pending',source:'collab',context_id:contextId}},()=>({data:[],has_more:false,counts:{pending:0,done:0}})),[contextId],{pollMs:3000})
 return <>{q.error&&<p role="alert" className="text-sm text-rose">确认事项加载失败：{q.error.message}<Button size="small" onClick={q.reload}>重试</Button></p>}{q.data?.data.filter(i=>i.context_id===contextId).map(item=><ReviewCard key={item.id} item={item} onRefresh={q.reload}/>)}</>
}
