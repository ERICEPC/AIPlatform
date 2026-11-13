import { useState } from 'react'
import { ScaffoldShowcase } from './scaffold-showcase'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { DevAsset } from './development-data'

const samples: Record<string, { heading:string; columns:string[]; rows:string[][] }> = {
 auth:{heading:'组织成员与权限',columns:['成员','角色','访问范围'],rows:[['张明','管理员','全部项目'],['李悦','开发者','研发工作空间'],['王宁','访客','只读访问']]},
 payment:{heading:'订单中心',columns:['订单','金额','状态'],rows:[['企业专业版 · 年付','¥ 2,400','已支付'],['团队扩容 · 10 席位','¥ 600','待支付'],['资源包续费','¥ 300','已完成']]},
 knowledge:{heading:'知识检索结果',columns:['问题 / 来源','摘要','相关度'],rows:[['如何接入 API？','创建 Key 后配置服务地址','98%'],['接入指南 · 第 3 节','请求示例与错误码','95%'],['常见问题','调用限额与重试策略','92%']]},
 analytics:{heading:'业务指标',columns:['指标','本周','环比'],rows:[['活跃用户','1,284','+18.6%'],['任务完成率','96.8%','+3.2%'],['平均响应','1.2 秒','-12%']]},
 workflow:{heading:'审批工作台',columns:['申请','负责人','进度'],rows:[['资源扩容申请','张明','审批中'],['项目上线申请','李悦','已通过'],['数据访问申请','王宁','待提交']]},
 notification:{heading:'消息中心',columns:['消息','渠道','时间'],rows:[['项目构建已完成','站内通知','刚刚'],['本周周报待提交','企业微信','10 分钟前'],['成员邀请已接受','邮件','1 小时前']]},
 'weekly-collector':{heading:'本周工作记录汇总',columns:['来源','记录数','同步状态'],rows:[['项目任务','24 条','已汇总'],['GitHub 提交','38 条','已去重'],['会议纪要','5 份','来源可追溯']]},
 'weekly-editor':{heading:'研发周报 · 第 46 周',columns:['章节','内容','状态'],rows:[['本周成果','完成登录模块与权限校验','已整理'],['问题与风险','接口联调等待测试环境','待补充'],['下周计划','完成集成验证与上线准备','草稿']]},
 'weekly-team-rollup':{heading:'团队周报总览',columns:['成员','项目','提交状态'],rows:[['张明','客户工作台','已提交'],['李悦','知识问答','已提交'],['王宁','数据服务','待提交']]},
 'weekly-risk-tracker':{heading:'风险与行动项',columns:['行动项','负责人','截止日期'],rows:[['确认联调接口','张明','周三'],['补充回归测试','李悦','周四'],['核对发布清单','王宁','周五']]},
 'weekly-delivery':{heading:'周报分发计划',columns:['任务','时间','渠道'],rows:[['提醒成员提交','每周五 15:00','企业微信'],['汇总团队周报','每周五 17:00','站内通知'],['发送管理摘要','每周一 09:00','邮件']]},
 miniapp:{heading:'小程序首页',columns:['服务','入口','状态'],rows:[['精选内容','首页推荐','可浏览'],['我的订单','订单中心','可查看'],['个人资料','个人中心','可编辑']]},
 commerce:{heading:'电商运营工作台',columns:['商品','售价','库存'],rows:[['商务双肩包','¥ 299','128'],['无线键盘','¥ 399','86'],['桌面支架','¥ 159','240']]},
 support:{heading:'客服接待工作台',columns:['会话','问题','状态'],rows:[['客户 A','订单配送进度','接待中'],['客户 B','产品使用咨询','等待回复'],['客户 C','售后申请','已解决']]},
 workspace:{heading:'团队项目空间',columns:['项目','负责人','进度'],rows:[['客户工作台','张明','开发中'],['知识服务','李悦','验收中'],['运营看板','王宁','已完成']]},
}
export function DevelopmentAssetPreview({asset,onClose}:{asset:DevAsset|null;onClose:()=>void}) {
 const [tab,setTab]=useState(0)
 const sample=asset ? samples[asset.id] : undefined
 return <Dialog open={!!asset} onOpenChange={open=>!open&&onClose()} title={asset ? `${asset.name} · 预览` : ''} description={asset?.description} size={asset?.kind==='template'?'wide':'xl'} footer={<Button onClick={onClose}>关闭预览</Button>}>{asset&&<div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
 {asset.kind==='template' && ['miniapp','commerce','support','workspace'].includes(asset.id) ? <ScaffoldShowcase key={asset.id} id={asset.id}/> : <section className="overflow-hidden rounded-lg border border-line bg-surface"><div className="flex items-center gap-1.5 border-b border-line bg-solid px-4 py-3"><span className="size-2 rounded-full bg-line"/><span className="size-2 rounded-full bg-line"/><span className="size-2 rounded-full bg-line"/><span className="ml-2 text-xs text-ink-3">效果预览 · 示例内容</span></div><div className="p-5"><h3 className="text-lg font-semibold">{sample?.heading || asset.name}</h3>{sample ? <><div className="my-4 flex gap-2">{['概览','功能范围'].map((label,i)=><Button key={label} size="small" variant={tab===i?'primary':'ghost'} onClick={()=>setTab(i)}>{label}</Button>)}</div>{tab===0?<div className="overflow-x-auto rounded-md border border-line bg-solid"><table className="w-full text-left text-xs"><thead className="bg-hover text-ink-3"><tr>{sample.columns.map(c=><th key={c} className="px-3 py-3 font-medium">{c}</th>)}</tr></thead><tbody>{sample.rows.map((row,i)=><tr key={i} className="border-t border-line">{row.map((cell,j)=><td key={j} className="px-3 py-4">{j===2?<span className="rounded bg-volt-soft px-2 py-1 text-volt-text">{cell}</span>:cell}</td>)}</tr>)}</tbody></table></div>:<div className="space-y-3">{asset.features.map((f,i)=><div key={f} className="flex items-center gap-3 rounded-md border border-line bg-solid p-4 text-xs"><span className="text-volt-text">0{i+1}</span>{f}</div>)}</div>}</>:<p className="my-5 rounded border border-dashed border-line p-6 text-sm leading-6 text-ink-3">此自定义资源尚未提供可视化预览。请查看资源说明与 Skill 配置，接入项目后验证实际效果。</p>}<p className="mt-5 text-[11px] leading-5 text-ink-3">预览用于了解界面与功能范围；实际效果以项目配置和接入的数据为准。</p></div></section>}
 <aside className="space-y-5"><div><h3 className="text-sm font-semibold">使用说明</h3><ol className="mt-3 space-y-4 text-xs leading-6 text-ink-2">{[asset.kind==='template'?'向开发助手说明产品需求，并指定此脚手架作为项目底座。':'在开发对话中提出所需功能，并指定使用此加速包。',`确认技术栈 ${asset.stack} 与项目兼容，并核对仓库版本。`,'由开发助手读取 Skill 配置，确认方案后接入项目，检查预览与验收结果。'].map((s,i)=><li key={s}><span className="mr-2 font-semibold text-volt-text">{i+1}.</span>{s}</li>)}</ol></div><div className="border-t border-line pt-4"><h3 className="text-sm font-semibold">包含能力</h3><ul className="mt-2 space-y-2 text-xs leading-5 text-ink-2">{asset.features.map(f=><li key={f}>· {f}</li>)}</ul></div><div className="rounded-md bg-surface p-3 text-xs leading-6 text-ink-3">版本 {asset.version}<br/>{asset.stack}</div></aside>
 </div>}</Dialog>
}
