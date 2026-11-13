import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'

// Interactive transport preserves the existing connector result contract.
// Requests are delivered to a local human; no approvals are manufactured.
export async function runAppServer({binary,args,env,cwd,prompt,sessionId,model,effort,onRequest,timeoutMs=300000}) {
  const child=spawn(binary,['app-server',...args],{cwd,env,stdio:['pipe','pipe','pipe']})
  let serial=0, stderr='', settled=false
  const pending=new Map(), events=[]
  let finish,fail
  const done=new Promise((resolve,reject)=>{finish=resolve;fail=reject});done.catch(()=>{})
  const send=x=>child.stdin.write(JSON.stringify(x)+'\n')
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});send({id,method,params})})
  const stop=e=>{if(settled)return;settled=true;for(const p of pending.values())p.reject(e);pending.clear();fail(e);child.kill()}
  const timer=setTimeout(()=>stop(new Error('本机任务超时；未完成的授权不会自动放行')),timeoutMs)
  child.on('error',stop);child.on('exit',code=>{if(!settled)stop(new Error(`本机交互执行进程退出 (${code}) ${stderr.slice(-300)}`))})
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000)})
  const lines=createInterface({input:child.stdout})
  lines.on('line',line=>{
    let e;try{e=JSON.parse(line)}catch{return}
    if(e.method && e.id!==undefined){
      Promise.resolve().then(()=>onRequest(e)).then(result=>{if(!settled)send({id:e.id,result})}).catch(error=>{if(!settled)send({id:e.id,error:{code:-32603,message:error.message}})})
      return
    }
    if(e.id!==undefined){const p=pending.get(e.id);pending.delete(e.id);e.error?p?.reject(new Error(e.error.message)):p?.resolve(e.result);return}
    const item=e.params?.item
    if(e.method==='item/completed'){
      if(item?.type==='agentMessage')events.push({type:'item.completed',item:{type:'agent_message',text:item.text}})
      else if(item?.type==='mcpToolCall')events.push({type:'item.completed',item:{type:'mcp_tool_call',server:item.server,tool:item.tool,status:item.status}})
      else if(item?.type==='commandExecution')events.push({type:'item.completed',item:{type:'command_execution',command:item.command,status:item.status,exit_code:item.exitCode}})
    }
    if(e.method==='turn/completed'){
      const turn=e.params.turn
      if(turn.status!=='completed')return stop(new Error(turn.error?.message||`本机任务${turn.status}`))
      settled=true;finish({events,answer:events.filter(x=>x.item?.type==='agent_message').at(-1)?.item.text||''});
    }
  })
  try {
    await rpc('initialize',{clientInfo:{name:'raccoonx_connector',title:'Raccoon X 本地连接器',version:'0.2.0'},capabilities:{experimentalApi:true,mcpServerOpenaiFormElicitation:true}})
    send({method:'initialized'})
    const options={cwd,sandbox:'workspace-write',approvalPolicy:'on-request',approvalsReviewer:'user',...(model?{model}:{})}
    let result
    try { result=await rpc(sessionId?'thread/resume':'thread/start',{...options,...(sessionId?{threadId:sessionId}:{})}) }
    catch(error) {
      if(!sessionId || !/not found|no rollout|unknown thread|could not find|does not exist/i.test(error.message))throw error
      result=await rpc('thread/start',options)
    }
    const threadId=result.thread.id
    events.push({type:'thread.started',thread_id:threadId})
    await rpc('turn/start',{threadId,input:[{type:'text',text:prompt}],effort})
    return await done
  } finally {settled=true;clearTimeout(timer);lines.close();child.kill()}
}
