// Invoked by the assistant: no account credentials, only this run's private queue.
import {readFile,writeFile,rename} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const [action,flag,file]=process.argv.slice(2)
try {
 if(!['create','list','resources','get','update','publish','status'].includes(action))throw Error('用法：create/update/publish --spec file.json；list；resources；get/status --id UUID')
 // The per-run copy identifies its own queue. Shell environment filters and
 // resumed sessions must not drop or redirect the active task binding.
 const queue=path.dirname(fileURLToPath(import.meta.url))
 if(path.basename(path.dirname(queue))!=='agent-cli'||!await readFile(path.join(queue,'.active'),'utf8').catch(()=>''))throw Error('当前任务授权已结束，请在个人助手新一轮任务中重试')
 let spec
 if(action==='create'||action==='update'||action==='publish'){if(flag!=='--spec'||!file)throw Error('需要 --spec JSON 文件');spec=JSON.parse(await readFile(file,'utf8'));if(action==='update'||action==='publish')spec={...spec,action}}
 else if(action==='get'||action==='status'){if(flag!=='--id'||!file)throw Error('需要 --id UUID');spec={action,id:file}}
 else spec={action}
 const id=randomUUID(),base=path.join(queue,id)
 await writeFile(base+'.tmp',JSON.stringify(spec),{mode:0o600});await rename(base+'.tmp',base+'.request')
 let result
 for(let i=0;i<600;i++) {try {result=JSON.parse(await readFile(base+'.response','utf8'));break}catch{} await new Promise(r=>setTimeout(r,100))}
 if(!result)throw Error('平台操作超时；修改请重新 get 检查结果，创建请使用同一名称重试')
 if(result.error)throw Error(result.error)
 process.stdout.write(JSON.stringify(result,null,2)+'\n')
} catch(e) {process.stderr.write('操作未完成：'+e.message+'\n');process.exitCode=1}
