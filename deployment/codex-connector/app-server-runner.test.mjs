import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {runAppServer} from './app-server-runner.mjs'
test('thread event and final answer converted without losing session; failure propagated',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'rx-rpc-test-')),fake=path.join(dir,'fake')
 await writeFile(fake,`#!/usr/bin/env node
const rl=require('readline').createInterface({input:process.stdin});const send=x=>console.log(JSON.stringify(x));rl.on('line',line=>{const r=JSON.parse(line);if(r.id!==undefined)send({id:r.id,result:r.method==='thread/start'?{thread:{id:'test-thread'}}:{}});if(r.method==='turn/start'){send({method:'item/completed',params:{item:{type:'agentMessage',text:'已完成'}}});send({method:'turn/completed',params:{turn:{status:process.env.TEST_FAIL?'failed':'completed',error:{message:'test failure'}}}})}})
`,{mode:0o700})
 const options={binary:fake,args:[],env:process.env,cwd:dir,prompt:'test',effort:'low',onRequest:()=>{throw Error('Unexpected request')}}
 try {const result=await runAppServer(options);assert.equal(result.answer,'已完成');assert.equal(result.events[0].thread_id,'test-thread');await assert.rejects(runAppServer({...options,env:{...process.env,TEST_FAIL:'1'}}),/test failure/)}finally{await rm(dir,{recursive:true,force:true})}
})
