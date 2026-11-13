export const DEMO_ROOTS=['dev-assistant','maas','tune','mcphub','data','models','accelerator','scaffold','monitor']
export function isDemoPath(path:string){const clean=path.split('?')[0];return DEMO_ROOTS.includes(clean.split('/')[0])||/^admin\/stack(\/|$)/.test(clean)}
export const demoNames:Record<string,string>={releases:'我的发布',tune:'个人智能体优化',teams:'工作流团队',mcphub:'平台 MCP 展示',data:'数据库与存储',models:'模型与额度',accelerator:'Buddy 加速器',scaffold:'脚手架',monitor:'调用与监控',spaces:'业务空间',stack:'AI 技术栈组件'}
