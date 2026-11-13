import {mkdir,readFile,writeFile,readdir,rm,copyFile,lstat} from 'node:fs/promises'
import path from 'node:path'
import https from 'node:https'
import {randomUUID} from 'node:crypto'

export async function startAgentCLI(work,capability,send=sendToPlatform){
 if(!capability)return {env:{},instructions:'',close:async()=>{}}
 const queue=path.join(work,'.raccoonx','agent-cli',randomUUID());await mkdir(queue,{recursive:true,mode:0o700})
 await writeFile(path.join(queue,'.active'),'active',{mode:0o600})
 const script=path.join(queue,'agent-cli.mjs');await copyFile(new URL('./agent-cli.mjs',import.meta.url),script)
 let closed=false;const seen=new Set();const active=new Set()
 const loop=(async()=>{while(!closed){
  for(const name of await readdir(queue)){
   if(!/^[a-f0-9-]{36}\.request$/.test(name)||seen.has(name))continue
   seen.add(name)
   const task=(async()=>{let result;try{
    const file=path.join(queue,name),stat=await lstat(file)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>100000)throw Error('CLI 请求文件无效')
    const spec=JSON.parse(await readFile(file,'utf8'))
    result=await send(capability,spec)
   }catch(e){result={error:e.message}}
   await writeFile(path.join(queue,name.replace('.request','.response')),JSON.stringify(result),{mode:0o600})
   })();active.add(task);task.finally(()=>active.delete(task))
  }
  await new Promise(r=>setTimeout(r,100))
 }})()
 return {env:{RACCOON_AGENT_QUEUE:queue},instructions:`\n平台智能体创建能力（已绑定当前用户与空间）：每一轮必须使用下方本轮 CLI 的完整路径，不能复用历史对话的命令路径。当用户要求创建平台智能体时，必须实际调用本轮 CLI，不要只输出方案或生成本地代码。先写 agent.json，包含 name、description、system_prompt；system_prompt 用中文写清角色、任务、步骤、边界、回答结构，教学内容可按目标语言输出。调用 node ${JSON.stringify(script)} create --spec agent.json。不需要用户提供平台账号密码。创建默认私有草稿；不能修改他人资源，发布使用下述命令并按可见范围执行规则。修改已有智能体：先调用 node ${JSON.stringify(script)} list 找到目标，再 get --id UUID 读取提示词、绑定资源和 revision；有多个同名候选时请用户选择。调用 resources 查询当前有权绑定的已发布 Skills、知识库和已授权 MCP，不能猜测资源 ID。update --spec update.json 的 JSON 为 {"id":"目标ID","revision":"get返回值","patch":{"system_prompt":"修改后的完整提示词","skills":{"add":["资源ID"],"remove":["资源ID或get返回file_id"]},"knowledge":{"add":["资源ID"],"remove":["资源ID"]},"mcp":{"add":["资源ID"],"remove":["资源ID或get返回provider_id"]}}。模型配置可使用 patch.model={"id":"resources.models 返回的 id","provider":"同条 provider"}。publish/status 返回 web.url、api.endpoint 和 api.access_url，请向用户提供真实 Web 地址和 API 使用入口。patch 只包含用户要求改动的字段，保留其他提示词约束和绑定；冲突时重新读取，不盲目覆盖。resources 没有的资源不能声称已配置，需如实反馈。创建后也可以通过 get/update 配置资源。对外 API 复用平台后端服务 API。用户明确要求发布时，先 get 最新 revision，再 publish --spec release.json，JSON 包含 id、revision、note，可选 external_access 布尔值；用户要求 Web/API 才设 true，未提及则省略以保留当前开关。Private 无需审批，publish 会立即发布并按要求开放 Web/API；部门或 Public 仍进入审批，不能绕过。必须根据返回的 published/state 如实区分“已发布”和“已提交待审批”。status --id UUID 查询结果。用户只要求修改/保存草稿时不能自动发布。API Key 由访问页管理，不输出密钥。update 仅保存草稿，不影响已发布 API 版本，不输出密钥。命令返回成功后才能说已创建或已修改，并用返回的 url 和 list_url 提供 Markdown 链接；created=false 表示已存在，必须如实说明未覆盖。失败时说明失败原因，不要声称完成。\n`,close:async()=>{closed=true;await loop;await Promise.allSettled(active);await rm(queue,{recursive:true,force:true})}}
}
async function sendToPlatform(cap,spec){
 const url=new URL(cap.url)
 if(url.protocol!=='https:'||url.hostname!=='10.151.113.125'||url.pathname!=='/console/api/personal-assistant/agent-cli')throw Error('平台 CLI 地址无效')
 const ca=await readFile(new URL('../assistant-agent-cli/server-ca.pem',import.meta.url))
 return await new Promise((resolve,reject)=>{
  const body=JSON.stringify(spec)
  const req=https.request(url,{method:'POST',ca,headers:{Authorization:'Bearer '+cap.token,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:45000},res=>{let data='';res.on('data',b=>{data+=b;if(data.length>100000)req.destroy(Error('平台响应过大'))});res.on('end',()=>{try{const obj=JSON.parse(data);if(res.statusCode>=400)reject(Error(obj.message||'平台拒绝创建'));else resolve(obj)}catch{reject(Error('平台返回无效结果'))}})})
  req.on('timeout',()=>req.destroy(Error('平台请求超时')));req.on('error',reject);req.end(body)
 })
}
