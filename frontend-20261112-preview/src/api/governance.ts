import { request, type HttpMethod } from './http'
export type Department = {id:string;name:string;parent_id:string|null}
export type Authority = {role:'developer'|'admin'|'super_admin';permissions:string[];department_ids:string[];scope_ids:string[];member_department_ids:string[];departments:Department[];enabled:boolean}
export type ReleaseOptions = {visibility:'private'|'department'|'workspace';department_ids:string[];department_id:string|null;external_access?:boolean}
export type Release = {id:string;resource_name:string;kind:string;action:string;state:string;note:string;comment:string;created_at:string;department_id:string|null;visibility:string;department_ids:string[];summary:Record<string,unknown>;result:{message?:string}}
export const governance = <T,>(path:string,method:HttpMethod='GET',body?:unknown) => request<T>({path,method,body},()=>{throw new Error('组织治理需要连接真实平台')})
export const getAuthority=()=>governance<Authority>('/account/permissions')
export const submitRelease=(kind:string,resource_id:string,action:string,note:string,options:ReleaseOptions)=>governance<Release>('/releases','POST',{kind,resource_id,action,note,...options})
export const releaseStates:Record<string,string>={pending:'待审批',approved:'已生效',returned:'退回修改',rejected:'已拒绝',withdrawn:'已撤回',failed:'执行失败',stale:'配置已变化'}
