/** Linked demo resources and approval records. IDs remain stable across reloads. */
import type { ResourceKind } from '../resource-sharing'
export type DevelopmentSeed = { id: string, kind: ResourceKind, name: string, description: string, state: 'personal' | 'pending' | 'returned' | 'approved' }
const examples: Record<ResourceKind, [string, string][]> = {
  agent: [['竞品研究助手', '对比产品能力、部署方式与服务范围，输出带来源的竞品分析。'], ['客户拜访复盘助手', '整理拜访记录，提取需求、异议与下一步行动。'], ['合同风险审查助手', '检查付款、验收与责任条款，输出需人工确认的风险清单。'], ['交付验收专家', '按验收标准核查交付物，形成验收报告与整改建议。']],
  team: [['行业洞察专家团', '研究员收集资料、分析师归纳趋势、团长形成行业简报。'], ['客户方案评审团', '从需求、技术、成本与合规四个角度评审客户方案。'], ['项目风险巡检团', '汇总项目进度、依赖与风险，输出负责人和处理期限。'], ['上线保障专家团', '串联上线检查、质量评测与风险复核，形成上线建议。']],
  knowledge: [['行业研究笔记', '个人整理的行业趋势、公开案例与研究方法。'], ['交付复盘案例集', '沉淀典型问题、解决过程和可复用的交付经验。'], ['报价与合同检查规范', '报价核验要点、合同模板及常见风险说明。'], ['团队交付标准库', '统一的交付流程、验收清单与项目文档模板。']],
  skill: [['会议行动项提取', '从会议记录中提取行动、负责人、截止时间与依赖。'], ['客户方案摘要', '把长方案整理为目标、价值、实施计划和风险四部分。'], ['项目周报生成', '按进展、风险、下周计划输出周报并标出缺失依据。'], ['交付验收清单生成', '根据交付范围生成检查清单和可验证的验收标准。']],
  mcp: [['研发工单查询', '按项目查询工单、优先级和处理进展（演示）。'], ['客户资料检索', '检索客户背景、沟通纪要和服务记录（演示）。'], ['项目文档检索', '按项目搜索文档标题、摘要与版本（演示）。'], ['团队知识检索', '只读检索交付规范、案例与常见问题（演示）。']],
}
export const developmentSeeds: DevelopmentSeed[] = Object.entries(examples).flatMap(([kind, rows]) => rows.map(([name, description], i) => ({ id: `demo-${kind}-${i + 1}`, kind: kind as ResourceKind, name, description, state: (['personal', 'pending', 'returned', 'approved'] as const)[i] })))
export const seedsFor = (kind: ResourceKind) => developmentSeeds.filter(s => s.kind === kind)
