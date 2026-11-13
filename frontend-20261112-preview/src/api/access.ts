import { getAuthority,type Authority } from './governance'
import { request } from './http'
export type Permissions=Authority & {tenant:{id:string;name:string}}
export const ROLE_LABEL={developer:'开发者',admin:'部门管理员',super_admin:'超级管理员'}
export const isAdmin=(p?:Permissions|null)=>!!p&&p.role!=='developer'
export const isSuper=(p?:Permissions|null)=>p?.role==='super_admin'
export async function getPermissions():Promise<Permissions>{
 const [p,w]=await Promise.all([getAuthority(),request<{workspaces:{id:string;name:string;current?:boolean}[]}>({method:'GET',path:'/workspaces'},()=>{throw Error('需要真实会话')})]);
 return {...p,tenant:w.workspaces.find(x=>x.current)||{id:'',name:'当前工作空间'}}
}
