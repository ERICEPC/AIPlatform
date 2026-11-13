import { useEffect, useState } from 'react'
import { request } from '@/api/http'
import type { PersonalConfig } from '@/api/personal'

type Device = {id:string,name:string,online:boolean,workspaces:{id:string,name:string,writable:boolean}[]}
const call=<T,>(method:'GET'|'POST'|'DELETE',path:string)=>request<T>({method,path},()=>{throw Error('本地连接器需要连接真实平台')})
export function DeviceAuthorization({id}:{id:string}) {
 const [name,setName]=useState('');const [error,setError]=useState('');const [done,setDone]=useState(false);const [busy,setBusy]=useState(false)
 useEffect(()=>{call<{device_name:string}>('GET','/desktop/authorize/'+encodeURIComponent(id)).then(r=>setName(r.device_name)).catch(e=>setError(e.message))},[id])
 const confirm=async()=>{setBusy(true);try{await call('POST','/desktop/authorize/'+encodeURIComponent(id));setDone(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="mx-auto my-16 w-full max-w-xl rounded-2xl border border-line bg-white p-8 text-ink"><h1 className="text-2xl font-semibold">绑定本地连接器</h1><p className="mt-4 leading-7 text-ink-2">{done?'设备已绑定。请返回本地客户端，选择工作区并点击“连接”。':`将设备“${name || '正在读取…'}”绑定到你当前的平台账号。只有你主动发起的配对才应确认。`}</p><p className="mt-3 text-sm leading-6 text-ink-3">绑定不会授予工作区或应用权限。这些权限仍由本机客户端逐项确认，你可以在个人助手配置中撤销设备。</p>{error&&<p role="alert" className="mt-4 text-red-600">{error}</p>}{!done&&<button disabled={!name||busy||!!error} onClick={confirm} className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50">{busy?'正在绑定…':'确认绑定我的电脑'}</button>}</div>
}
export function DesktopDevicePicker({config,onChange}:{config:PersonalConfig,onChange:(p:Partial<PersonalConfig>)=>void}) {
 const [devices,setDevices]=useState<Device[]>([]);const [error,setError]=useState('')
 const load=()=>{setError('');call<{devices:Device[]}>('GET','/desktop/devices').then(r=>setDevices(r.devices)).catch(e=>setError(e.message))}
 useEffect(load,[])
 const selected=devices.find(d=>d.id===config.desktopDeviceId)
 return <div className="space-y-3 p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">独立本地客户端 · 预览版</h3><button onClick={load} className="text-xs text-blue-600">刷新设备</button></div><p className="text-xs leading-5 text-ink-3">选择已登录并连接的电脑。工作区授权在本机完成。切换执行方式后请新建对话；旧连接器仍可回退。</p><select aria-label="本地执行设备" className="w-full rounded-xl border border-line bg-hover p-3 text-sm" value={config.desktopDeviceId||''} onChange={e=>onChange({desktopDeviceId:e.target.value,desktopWorkspaceId:'',workspacePath:''})}><option value="">使用现有连接器（保持当前功能）</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name} · {d.online?'在线':'离线'}</option>)}</select>{selected&&<><select aria-label="设备工作区" className="w-full rounded-xl border border-line bg-hover p-3 text-sm" value={config.desktopWorkspaceId||''} onChange={e=>onChange({desktopWorkspaceId:e.target.value})}><option value="">选择本机已授权工作区</option>{selected.workspaces.map(w=><option key={w.id} value={w.id}>{w.name} · {w.writable?'读写':'只读'}</option>)}</select><p className="text-xs text-ink-3">需在下方选择云端模型，并保存应用。本机不需要模型密钥。</p><button className="text-xs text-red-600" onClick={async()=>{if(!confirm(`撤销设备“${selected.name}”的连接？运行中的任务会停止。`))return;try{await call('DELETE','/desktop/devices/'+selected.id);onChange({desktopDeviceId:'',desktopWorkspaceId:''});load()}catch(e){setError((e as Error).message)}}}>撤销此设备</button></>}{!devices.length&&!error&&<p className="text-xs text-ink-3">尚无已绑定设备，请先在独立客户端登录。</p>}{error&&<p className="text-xs text-red-600">{error}</p>}</div>
}
