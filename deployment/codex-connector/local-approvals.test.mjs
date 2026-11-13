import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,unlink} from 'node:fs/promises'
import {approvalResponse,startLocalApprovals} from './local-approvals.mjs'
const request={method:'mcpServer/elicitation/request',params:{mode:'form',message:'Allow PowerPoint?',requestedSchema:{type:'object',properties:{}}}}
test('only explicit supported confirmation accepted; forms cannot be fabricated',()=>{
 assert.deepEqual(approvalResponse(request,'accept'),{action:'accept',content:{},_meta:null})
 assert.equal(approvalResponse(request,'decline').content,null)
 assert.throws(()=>approvalResponse({...request,params:{...request.params,requestedSchema:{properties:{password:{type:'string'}}}}},'accept'))
 assert.throws(()=>approvalResponse(request,'acceptForSession'))
 assert.throws(()=>approvalResponse({method:'unknown'},'accept'))
})
test('local portal authentication, CSRF, single-use and timeout refusal',async()=>{
 const port=18794,urlFile='/tmp/rx-approval-test-url',a=await startLocalApprovals({port,urlFile,timeoutMs:150})
 try {
  const url=new URL(await readFile(urlFile,'utf8')),base=url.origin,headers={Authorization:`Bearer ${url.hash.slice(1)}`}
  assert.equal((await fetch(base+'/pending')).status,401)
  const pending=a.request(request,'test')
  const data=await (await fetch(base+'/pending',{headers})).json(),id=data.requests[0].id
  const decide=origin=>fetch(base+'/decide',{method:'POST',headers:{...headers,'Content-Type':'application/json',Origin:origin},body:JSON.stringify({id,decision:'accept'})})
  assert.equal((await decide('https://attacker.invalid')).status,403)
  assert.equal((await decide(base)).status,200)
  assert.equal((await pending).action,'accept')
  assert.equal((await decide(base)).status,409)
  assert.equal((await a.request(request,'timeout')).action,'decline')
 }finally{await a.close();await unlink(urlFile)}
})
test('explicit task grant is confined to same turn and app, revoked at job end',async()=>{
 const port=18795,urlFile='/tmp/rx-approval-scope-test',a=await startLocalApprovals({port,urlFile,timeoutMs:100})
 const app={...request,params:{...request.params,threadId:'thread',turnId:'turn',serverName:'cua_repl',_meta:{codex_approval_kind:'mcp_tool_call',connector_id:'computer-use',persist:['session'],tool_name:'get_app_state',riskLevel:'low',tool_params:{app:'com.microsoft.Powerpoint'}}}}
 try{
  const url=new URL(await readFile(urlFile,'utf8')),headers={Authorization:`Bearer ${url.hash.slice(1)}`}
  const wait=a.request(app,'test'),{requests}=await(await fetch(url.origin+'/pending',{headers})).json()
  await fetch(url.origin+'/decide',{method:'POST',headers:{...headers,'Content-Type':'application/json',Origin:url.origin},body:JSON.stringify({id:requests[0].id,decision:'acceptTask'})})
  assert.equal((await wait).action,'accept')
  assert.equal((await a.request(app,'same task')).action,'accept')
  assert.equal((await a.request({...app,params:{...app.params,_meta:{...app.params._meta,tool_name:'click'}}},'same app interaction')).action,'accept')
  assert.equal((await a.request({...app,params:{...app.params,turnId:'another'}},'other turn')).action,'decline')
  assert.equal((await a.request({...app,params:{...app.params,_meta:{...app.params._meta,tool_params:{app:'other'}}}},'other app')).action,'decline')
  a.cancelAll()
  assert.equal((await a.request(app,'after end')).action,'decline')
 }finally{await a.close();await unlink(urlFile)}
})
