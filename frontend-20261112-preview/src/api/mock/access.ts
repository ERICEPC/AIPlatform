/*
  演示账号与权限 mock：三个账号覆盖三种角色，选中的账号存在 localStorage（rx-demo-account），刷新后保持。
  示例同事姓名沿用开发约定；截图用于对外材料时由截图脚本替换成岗位名。
*/
import type { DemoAccount, Permissions } from '../access'
import { asset } from '@/lib/asset'

const KEY = 'rx-demo-account'
export const demoAccounts: DemoAccount[] = [
  { id: 'dev', name: '叶源', email: 'yeyuan@example.com', avatar: asset('/raccoon-emoji-v1/004-programming.webp'), role: 'developer', title: '智能体开发', hint: '个人权限搭建工作流与智能体；已获 FDE 交付中心组织授权' },
  { id: 'admin', name: '蒋磊', email: 'jianglei@example.com', avatar: asset('/raccoon-emoji-v1/007-sales.webp'), role: 'admin', title: '销售管理业务管理员', hint: '管理范围：销售管理业务 · 北区东区 · 售前方案团队' },
  { id: 'super', name: '李鹏程', email: 'lipengcheng@example.com', avatar: asset('/raccoon-emoji-v1/036-leadership.webp'), role: 'super_admin', title: '平台超级管理员', hint: '全部权限，含 AI 技术栈组件连接配置' },
]

export function currentDemo(): DemoAccount | null {
  try {
    const id = localStorage.getItem(KEY)
    return demoAccounts.find(a => a.id === id) ?? null
  }
  catch {
    return null
  }
}
export function signIn(id: DemoAccount['id']) {
  try {
    localStorage.setItem(KEY, id)
  }
  catch {}
}
export function signOut() {
  try {
    localStorage.removeItem(KEY)
  }
  catch {}
}

const tenant = { id: 'tenant-sg27', name: '大模型生态渠道部' }
const perms: Record<DemoAccount['id'], Permissions> = {
  dev: { role: 'developer', title: '智能体开发', department: 'FDE 交付中心', scopes: [], org_grants: [{ id: 'dept-fde', name: 'FDE 交付中心', actions: ['build_team', 'build_agent', 'request_publish'] }], linked_apps: ['ProjectBuddy', 'SalesBuddy'], tenant },
  admin: { role: 'admin', title: '销售管理业务管理员', department: '北区东区', scopes: [{ type: 'business', id: 'biz-sales', name: '销售管理' }, { type: 'department', id: 'dept-north', name: '北区东区' }, { type: 'workflow', id: 'presales', name: '售前方案团队' }], org_grants: [{ id: 'dept-north', name: '北区东区', actions: ['build_team', 'build_agent', 'request_publish'] }], linked_apps: ['SalesBuddy'], tenant },
  super: { role: 'super_admin', title: '平台超级管理员', department: 'FDE 交付中心', scopes: [], org_grants: [{ id: 'org-all', name: '全部组织', actions: ['build_team', 'build_agent', 'request_publish'] }], linked_apps: ['ProjectBuddy', 'SalesBuddy'], tenant },
}
export const permissions = (): Permissions => perms[currentDemo()?.id ?? 'dev']
