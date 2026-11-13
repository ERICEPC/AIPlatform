import readline from 'node:readline'
import https from 'node:https'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const string={type:'string'}, ids={type:'array',items:string}, changes={type:'object',properties:{add:ids,remove:ids},additionalProperties:false}
export const tools=[
 ['list','列出当前账号“我的”智能体，修改前先找到真实 ID。',{}],
 ['resources','查询当前账号可使用的模型、知识库、已发布 Skills 和已授权 MCP，不得猜测资源 ID。',{}],
 ['create','实际创建私有智能体草稿。先根据用户需求写完整提示词；同名不覆盖。',{name:string,description:string,system_prompt:string},['name','system_prompt']],
 ['get','读取智能体配置和最新 revision。',{id:string},['id']],
 ['update','保存用户要求的草稿配置。保留未指定字段；revision 冲突先重新读取。',{id:string,revision:string,patch:{type:'object',properties:{system_prompt:string,model:{type:'object',properties:{id:string,provider:string},required:['id','provider'],additionalProperties:false},skills:changes,knowledge:changes,mcp:changes},additionalProperties:false}},['id','revision','patch']],
 ['publish','用户明确要求发布才调用。用户要求 Web/API 时 external_access=true。按返回状态区分已发布与待审批。',{id:string,revision:string,note:string,external_access:{type:'boolean'}},['id','revision']],
 ['status','查询真实发布状态、Web 地址、API 入口及密钥管理页。',{id:string},['id']],
].map(([name,description,properties,required=[]])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}))
export async function invoke(cap,name,args={},ca){
 if(!tools.some(t=>t.name===name))throw Error('不支持的智能体操作')
 const url=new URL(cap.url)
 if(url.protocol!=='https:'||url.hostname!=='10.151.113.125'||url.port!=='21190'||url.pathname!=='/console/api/personal-assistant/agent-cli')throw Error('平台工具地址无效')
 const body=JSON.stringify(name==='create'?args:{...args,action:name})
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{method:'POST',ca,headers:{Authorization:'Bearer '+cap.token,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:45000},res=>{
   let data='';res.on('data',b=>{data+=b;if(data.length>1000000)req.destroy(Error('平台响应过大'))});res.on('end',()=>{try{const result=JSON.parse(data);if(res.statusCode>=400)reject(Error(result.message||'平台操作失败'));else resolve(result)}catch{reject(Error('平台响应格式错误'))}})
  });req.on('timeout',()=>req.destroy(Error('平台请求超时，请查询状态后再决定是否重试')));req.on('error',reject);req.end(body)
 })
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const cap=JSON.parse(process.env.AGENT_MANAGER_CAPABILITY||'{}')
 const ca=await readFile(new URL('./platform-ca.pem',import.meta.url))
 for await(const line of readline.createInterface({input:process.stdin})){
  let m
  try{m=JSON.parse(line);if(m.id===undefined)continue;let result
   if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'raccoon-agent-manager',version:'1.0.0'}}
   else if(m.method==='ping')result={}
   else if(m.method==='tools/list')result={tools}
   else if(m.method==='tools/call')result={content:[{type:'text',text:JSON.stringify(await invoke(cap,m.params.name,m.params.arguments,ca))}]}
   else throw Error('不支持此方法')
   process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n')
  }catch(e){if(m?.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{isError:true,content:[{type:'text',text:String(e.message).replaceAll(cap.token||'__none__','[REDACTED]')}]}})+'\n')}
 }
}
