import http from 'node:http'
import {randomBytes, timingSafeEqual} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'

export function approvalResponse(request, decision) {
  if (!['accept', 'decline'].includes(decision)) throw new Error('无效决定')
  if (request.method === 'mcpServer/elicitation/request') {
    const p = request.params
    // Only confirmation-only forms; never invent answers to a server's form.
    if (decision === 'accept' && (p.mode !== 'form' || Object.keys(p.requestedSchema?.properties || {}).length || p.requestedSchema?.required?.length)) throw new Error('此请求需要填写表单，当前仅支持确认，请拒绝后补充需求')
    return {action: decision, content: decision === 'accept' ? {} : null, _meta: null}
  }
  if (['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(request.method)) return {decision}
  throw new Error('当前不支持此类授权，已停止等待')
}

export function applicationGrantKey(request) {
  const p=request.params, m=p?._meta
  if(request.method!=='mcpServer/elicitation/request' || p.mode!=='form' || p.serverName!=='cua_repl' || m?.codex_approval_kind!=='mcp_tool_call' || Object.keys(p.requestedSchema?.properties||{}).length || !p.threadId || !p.turnId || m?.connector_id!=='computer-use' || !m?.persist?.includes('session') || Object.keys(m?.tool_params||{}).some(k=>k!=='app') || m?.riskLevel!=='low' || typeof m?.tool_params?.app!=='string') return null
  return JSON.stringify([p.threadId,p.turnId,m.tool_params.app])
}

export async function startLocalApprovals({port = 8790, timeoutMs = 120000, urlFile = '/tmp/raccoonx-local-approval-url'} = {}) {
  let token = randomBytes(32).toString('hex')
  // Keep the local user's open approval page usable across connector restarts.
  // Task grants remain memory-only and are never restored.
  try {
    const prior = new URL(await readFile(urlFile, 'utf8'))
    if(prior.origin===`http://127.0.0.1:${port}` && /^[a-f0-9]{64}$/.test(prior.hash.slice(1))) token=prior.hash.slice(1)
  } catch {}
  const pending = new Map(), applicationGrants = new Set()
  let serial = 0
  const origin = `http://127.0.0.1:${port}`
  const matches = value => { const a=Buffer.from(value || ''), b=Buffer.from(`Bearer ${token}`);return a.length===b.length && timingSafeEqual(a,b) }
  const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Frame-Options','DENY')
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; connect-src 'self'")
    const reply=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
    if(req.headers.host!==`127.0.0.1:${port}`)return reply(403,{error:'Invalid host'})
    if(req.method==='GET' && req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page)}
    if(!matches(req.headers.authorization))return reply(401,{error:'Unauthorized'})
    if(req.method==='GET' && req.url==='/pending')return reply(200,{requests:[...pending.values()].map(x=>({id:x.id,method:x.request.method,params:x.request.params,context:x.context,expiresAt:x.expiresAt,canGrantTask:!!applicationGrantKey(x.request)}))})
    if(req.method!=='POST' || req.url!=='/decide' || req.headers.origin!==origin)return reply(403,{error:'Forbidden'})
    try {
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw new Error('请求过大')}
      const {id,decision}=JSON.parse(body), entry=pending.get(id)
      if(!entry)return reply(409,{error:'请求已结束或过期'})
      const key=applicationGrantKey(entry.request)
      if(decision==='acceptTask' && !key)throw new Error('此请求不支持任务授权')
      const answer=approvalResponse(entry.request,decision==='acceptTask'?'accept':decision)
      if(decision==='acceptTask')applicationGrants.add(key)
      clearTimeout(entry.timer);pending.delete(id);entry.resolve(answer);reply(200,{ok:true})
    }catch(e){reply(400,{error:e.message})}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  await writeFile(urlFile,`${origin}/#${token}`,{mode:0o600})
  return {
    request(request, context) {
      const key=applicationGrantKey(request)
      if(key && applicationGrants.has(key))return Promise.resolve(approvalResponse(request,'accept'))
      try {approvalResponse(request,'decline')}catch(e){return Promise.reject(e)}
      return new Promise(resolve=>{
        const id=String(++serial), entry={id,request,context,resolve,expiresAt:Date.now()+timeoutMs}
        entry.timer=setTimeout(()=>{pending.delete(id);resolve(approvalResponse(request,'decline'))},timeoutMs)
        pending.set(id,entry)
      })
    },
    cancelAll(){applicationGrants.clear();for(const x of pending.values()){clearTimeout(x.timer);x.resolve(approvalResponse(x.request,'decline'))}pending.clear()},
    async close(){this.cancelAll();await new Promise(resolve=>server.close(resolve))},
  }
}
const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本机操作确认 · Raccoon X</title><style>body{font:15px/1.7 system-ui;background:#f5f7fc;color:#18233b;margin:40px auto;padding:0 24px;max-width:800px}h1{font-size:26px}article{background:white;border:1px solid #dce3f1;border-radius:18px;padding:24px;margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7fc;padding:12px;border-radius:8px;font-size:13px}button{padding:10px 24px;border:1px solid #ccd4e5;border-radius:9px;margin-right:12px;cursor:pointer;background:white}button.allow{background:#2563eb;color:white;border:0}.hint{color:#66758e}#status{color:#a63822}</style><h1>本机操作确认</h1><p class="hint">个人助手正在请求操作这台电脑。请核对任务、应用和具体操作。可仅允许一次，或允许本次任务使用当前应用；任务结束后失效。拒绝或超时不会放行。</p><div id="status"></div><main id="requests"></main><script>
const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);let signature='';
async function call(url,data){const r=await fetch(url,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw Error(v.error);return v}
async function refresh(){try{const {requests}=await call('/pending');const next=JSON.stringify(requests);if(next===signature)return;signature=next;document.querySelector('#requests').replaceChildren();if(!requests.length){document.querySelector('#requests').textContent='当前没有待确认的本机操作。';return}for(const r of requests){const a=document.createElement('article');const h=document.createElement('h2');h.textContent=r.params.message||r.params.reason||'本机操作请求';a.append(h);const c=document.createElement('p');c.textContent='任务：'+r.context;a.append(c);const p=document.createElement('pre');p.textContent=JSON.stringify({type:r.method,app:r.params._meta?.tool_params_display,tool:r.params._meta?.tool_name,operation:r.params._meta?.tool_params,command:r.params.command,cwd:r.params.cwd,form:r.params.requestedSchema},null,2);a.append(p);for(const [decision,label]of [['decline','拒绝'],['accept','仅允许一次'],...(r.canGrantTask?[['acceptTask','允许本次任务使用此应用']]:[])]){const b=document.createElement('button');b.textContent=label;b.className=decision.startsWith('accept')?'allow':'';b.onclick=async()=>{b.disabled=true;try{await call('/decide',{id:r.id,decision});signature='';await refresh()}catch(e){document.querySelector('#status').textContent=e.message;b.disabled=false}};a.append(b)}document.querySelector('#requests').append(a)}}catch(e){document.querySelector('#status').textContent=e.message}}
refresh();setInterval(refresh,1000);
</script></html>`
