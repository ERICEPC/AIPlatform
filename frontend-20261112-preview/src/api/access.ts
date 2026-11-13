import { getAuthority,type Authority } from './governance'
import { API_MODE, request } from './http'
export type Permissions=Authority & {tenant:{id:string;name:string}}
export const ROLE_LABEL={member:'成员',dept_head:'部门负责人',super_admin:'超级管理员'}
export const isAdmin=(p?:Permissions|null)=>!!p&&p.role!=='member'
export const isSuper=(p?:Permissions|null)=>p?.role==='super_admin'
export async function getPermissions():Promise<Permissions>{
 if(API_MODE==='mock')return {...await getAuthority(),tenant:{id:'demo',name:'大模型生态渠道部'}}
 const [p,w]=await Promise.all([getAuthority(),request<{workspaces:{id:string;name:string;current?:boolean}[]}>({method:'GET',path:'/workspaces'},()=>{throw Error('需要真实会话')})]);
 return {...p,tenant:w.workspaces.find(x=>x.current)||{id:'',name:'当前工作空间'}}
}
