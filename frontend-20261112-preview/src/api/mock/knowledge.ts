/*
  知识库 mock：模拟 Raccoon KnowledgeBase 后端返回（字段形状与 vue/src/mocks 一致）。
  内存状态：上传会生成新材料并逐步推进到「可用于问答」；个人知识库可新建/改名/归档/删除；问答会写入会话。
*/
import type {
  KbAccessPolicy, KbDocumentOption, KbDocumentQuery, KbExchange, KbFacetOption, KbFeedback, KbFeedbackReason, KbFilterOptions,
  KbLibrary, KbMaterial, KbOverview, KbPage, KbPersonalLibrary, KbPreview, KbProcessing, KbProcessingState, KbProfile,
  KbReference, KbSessionDetail, KbSessionPage, KbShareCreated, KbShareEligibility, KbStreamPayload, KbUploadDraft, KbUploadForm,
  KbUploadOptions, KbVersion, KbVisibility,
} from '../knowledge'
import { ApiError, mockId, nowIso } from '../http'

const DAY = 86_400_000
const BOOT = Date.now()
const ago = (days: number) => new Date(BOOT - days * DAY).toISOString()

type Lib = { id: string, baseName: string, description: string, visibility: KbVisibility, owned: boolean, archived: boolean, policyVersion: number, editTime: string }

const libs: Lib[] = [
  { id: 'kb-fde', baseName: 'FDE 交付资料库', description: '交付方案、上线检查清单与项目复盘', visibility: 'TENANT', owned: false, archived: false, policyVersion: 1, editTime: ago(0.2) },
  { id: 'kb-yifei', baseName: '翼飞产品资料', description: '翼飞客服产品手册、发布说明与培训材料', visibility: 'TENANT', owned: false, archived: false, policyVersion: 1, editTime: ago(0.6) },
  { id: 'kb-presales', baseName: '售前方案库', description: '行业方案、客户案例、竞品对比与合规材料', visibility: 'TENANT', owned: false, archived: false, policyVersion: 1, editTime: ago(1.2) },
  { id: 'kb-contract', baseName: '合同与报价', description: '合同模板、报价模板与审批口径', visibility: 'CUSTOM', owned: false, archived: false, policyVersion: 1, editTime: ago(2) },
  { id: 'kb-me-notes', baseName: '叶源的工作笔记', description: '周会纪要与个人整理', visibility: 'PRIVATE', owned: true, archived: false, policyVersion: 3, editTime: ago(1) },
  { id: 'kb-me-bank', baseName: '银行项目临时资料', description: '银行客户需求与沟通记录', visibility: 'TENANT', owned: true, archived: false, policyVersion: 2, editTime: ago(2) },
]

const FORMATS: Record<string, [string, string]> = {
  pdf: ['1', 'PDF'],
  docx: ['3', 'Word'],
  xlsx: ['23', 'Excel'],
  pptx: ['24', 'PPT'],
  md: ['5', 'Markdown'],
  png: ['7', '图片'],
}

// [标题, 知识库, 扩展名, 产品, 分类, 对外使用范围, 来源备注, 负责人, 部门, 几天前更新]
type Seed = [string, string, string, string, string, string, string, string, string, number]
const seeds: Seed[] = [
  ['FDE 交付方案模板 v3', 'kb-fde', 'docx', 'RaccoonX', '交付方案', '仅内部', '标准化交付方案骨架：需求澄清、方案设计、联调上线到验收的四阶段节奏与角色分工。', '李鹏程', 'FDE 交付部', 0.2],
  ['翼飞客服产品手册 2026', 'kb-yifei', 'pdf', '翼飞客服', '产品手册', '可对客', '翼飞客服全渠道接入、智能质检与坐席辅助的功能说明与配置入口。', '周玮', '产品部', 0.6],
  ['城商行私有化部署方案', 'kb-presales', 'pdf', '翼飞客服', '部署方案', '可对客', '面向城商行的私有化部署架构：两地三中心、GPU 资源规划与等保三级要求。', '蒋磊', '解决方案部', 1.2],
  ['软件许可与实施服务合同模板', 'kb-contract', 'docx', '平台', '合同模板', '仅内部', '标准许可加实施服务合同条款，含验收标准、知识产权与数据保密条款。', '金豫玮', '法务部', 2],
  ['标准报价模板（2026 Q4）', 'kb-contract', 'xlsx', 'RaccoonX', '报价模板', '仅内部', '按坐席数与调用量阶梯计价，含折扣审批红线与私有化一次性费用。', '金豫玮', '商务部', 2.4],
  ['华东某银行项目上线复盘', 'kb-fde', 'md', '翼飞客服', '项目复盘', '仅内部', '从签约到上线 9 周的关键节点、三次需求变更与压测问题的处理经验。', '叶源', 'FDE 交付部', 3],
  ['翼飞客服 v5.2 发布说明', 'kb-yifei', 'md', '翼飞客服', '发布说明', '可对客', '新增多轮意图编排、质检规则热更新与飞书工单同步。', '周玮', '产品部', 3.5],
  ['RaccoonX 平台介绍', 'kb-presales', 'pptx', 'RaccoonX', '产品介绍', '可对伙伴', '企业级 Agent 平台定位、核心能力与典型落地场景，适合首次拜访使用。', '蒋磊', '解决方案部', 4],
  ['保险行业客户案例集', 'kb-presales', 'pptx', '翼飞客服', '客户案例', '可对客', '三家保险公司的智能客服落地背景、实施周期与效果数据。', '蒋磊', '解决方案部', 5],
  ['上线前检查清单', 'kb-fde', 'md', 'RaccoonX', '交付方案', '仅内部', '上线前 48 小时必须完成的 32 项检查：权限、监控、回滚、话术与值班。', '李鹏程', 'FDE 交付部', 6],
  ['翼飞坐席培训手册', 'kb-yifei', 'pdf', '翼飞客服', '培训材料', '仅总代', '坐席工作台操作、知识检索与转人工规则的培训讲义。', '周玮', '产品部', 7],
  ['竞品对比速查表', 'kb-presales', 'xlsx', '平台', '竞品分析', '仅内部', '主流智能客服与 Agent 平台的能力、价格与差异化话术。', '蒋磊', '解决方案部', 8],
  ['私有化部署架构图', 'kb-fde', 'png', 'RaccoonX', '部署方案', '待确认', '标准私有化部署拓扑：接入层、推理集群、向量库与监控组件。', '李鹏程', 'FDE 交付部', 9],
  ['数据安全与合规白皮书', 'kb-presales', 'pdf', '平台', '合规材料', '可对客', '数据分级、等保三级、审计留痕与模型安全评估说明。', '金豫玮', '法务部', 10],
  ['保密协议（NDA）模板', 'kb-contract', 'docx', '平台', '合同模板', '可对伙伴', '双向保密协议标准文本，适用于售前 POC 阶段。', '金豫玮', '法务部', 12],
  ['商机周报模板', 'kb-presales', 'xlsx', 'SalesBuddy', '销售支持', '仅内部', '按阶段跟踪商机金额、下一步动作与风险的周报模板。', '叶源', '销售运营', 13],
  ['SalesBuddy 售前方案', 'kb-presales', 'pdf', 'SalesBuddy', '产品介绍', '可对客', '销售助手在线索跟进、拜访纪要与商机预测中的能力说明。', '蒋磊', '解决方案部', 14],
  ['项目周会纪要（翼飞二期）', 'kb-me-notes', 'md', '翼飞客服', '会议纪要', '仅内部', '二期范围确认、接口联调排期与客户侧资源协调事项。', '叶源', 'FDE 交付部', 1],
  ['银行客户需求澄清记录', 'kb-me-bank', 'docx', '翼飞客服', '需求文档', '仅内部', '客户对质检、坐席辅助与报表的 26 条需求及优先级。', '叶源', 'FDE 交付部', 2],
  ['翼飞客服接口对接指南', 'kb-yifei', 'md', '翼飞客服', '开发文档', '可对伙伴', '工单、会话与知识同步的 REST 接口说明、鉴权方式与回调约定。', '周玮', '产品部', 15],
  ['交付里程碑甘特图', 'kb-fde', 'xlsx', 'RaccoonX', '交付方案', '仅内部', '标准 12 周交付里程碑及每周交付物。', '李鹏程', 'FDE 交付部', 18],
  ['零售行业客服方案', 'kb-presales', 'pptx', '翼飞客服', '行业方案', '可对客', '电商大促场景的弹性扩容、智能分流与售后自动化方案。', '蒋磊', '解决方案部', 20],
  ['验收报告模板', 'kb-fde', 'docx', 'RaccoonX', '交付方案', '仅内部', '功能、性能、安全三类验收项与签字页。', '李鹏程', 'FDE 交付部', 22],
  ['翼飞客服产品截图集', 'kb-yifei', 'png', '翼飞客服', '产品手册', '可对客', '坐席工作台、质检看板与机器人配置页的高清截图。', '周玮', '产品部', 25],
  ['渠道合作伙伴报价口径', 'kb-contract', 'xlsx', '平台', '报价模板', '仅总代', '总代与二级渠道的折扣区间与返点规则。', '金豫玮', '商务部', 28],
  ['某股份制银行 POC 复盘', 'kb-fde', 'md', '翼飞客服', '项目复盘', '仅内部', 'POC 两周内的指标达成情况、失分点与后续打法。', '叶源', 'FDE 交付部', 30],
  ['客户拜访要点速记', 'kb-me-notes', 'md', 'SalesBuddy', '会议纪要', '仅内部', '近两周三家客户拜访的关注点、异议与下一步约定。', '叶源', 'FDE 交付部', 0.4],
  ['翼飞二期方案草稿', 'kb-me-notes', 'docx', '翼飞客服', '交付方案', '待确认', '二期范围、里程碑和资源估算的初稿，待与李鹏程对齐。', '叶源', 'FDE 交付部', 4],
  ['私有化部署答疑整理', 'kb-me-notes', 'md', 'RaccoonX', '部署方案', '可对伙伴', '伙伴常问的 18 个部署问题及标准答复。', '叶源', 'FDE 交付部', 9],
  ['银行项目报价测算', 'kb-me-bank', 'xlsx', '翼飞客服', '报价模板', '仅内部', '按 800 坐席测算的私有化许可与实施人天。', '叶源', 'FDE 交付部', 5],
  ['银行客户汇报材料', 'kb-me-bank', 'pptx', '翼飞客服', '行业方案', '可对客', '面向银行客户的阶段汇报：进展、风险与下阶段计划。', '叶源', 'FDE 交付部', 6],
]

/* 按分类准备正文片段，让预览、概览、问答引用读起来像真的 */
type Body = { points: string[], table: [string, string][], cautions: string[] }
const BODIES: Record<string, Body> = {
  交付方案: { points: ['第 1–2 周完成需求澄清与业务流程梳理，输出需求确认单', '第 3–6 周按模块联调，每周五与客户对齐演示', '上线前完成压测、回滚演练与值班排班', '验收按功能、性能、安全三类清单逐项签字'], table: [['标准周期', '10–12 周'], ['客户侧角色', '项目经理、业务专家、运维'], ['交付物', '方案书、联调报告、验收报告']], cautions: ['需求变更走变更单，超过 3 人日需商务确认', '生产数据不出客户环境'] },
  产品手册: { points: ['全渠道接入：电话、在线、企业微信、App 内嵌统一进线', '智能质检：100% 会话覆盖，规则与模型双通道', '坐席辅助：实时话术推荐与知识卡片', '管理后台：技能组、排班与报表一体化配置'], table: [['支持渠道', '7 类'], ['单租户坐席上限', '5000'], ['质检时效', '会话结束后 5 分钟内']], cautions: ['截图中的客户名称已脱敏', '功能以签约版本为准'] },
  部署方案: { points: ['推荐两地三中心部署，主备切换 RTO ≤ 15 分钟', '推理集群起步 8 张 A800，按 2000 坐席并发估算', '向量库与业务库物理隔离，独立备份', '满足等保三级：审计日志留存 180 天'], table: [['GPU', '8 × A800 起'], ['CPU 节点', '6 台 64C/256G'], ['网络', '万兆内网，专线互通']], cautions: ['GPU 型号需与客户采购目录核对', '离线环境需提前准备镜像仓库'] },
  合同模板: { points: ['许可范围按坐席数与部署节点计', '实施服务按里程碑付款：30% / 40% / 30%', '验收以验收报告签字为准，逾期 10 个工作日视为通过', '双方对项目资料承担保密义务，期限 3 年'], table: [['付款节点', '3 个'], ['质保期', '12 个月'], ['违约金上限', '合同总额 10%']], cautions: ['条款修改需法务审核', '对客发送前删除内部批注'] },
  报价模板: { points: ['SaaS 按坐席数阶梯计价：100 席以下标准价', '私有化收取一次性许可费加年度维保 15%', '折扣低于 7 折需销售总监审批', '大模型调用量超出套餐按量计费'], table: [['标准坐席价', '¥ 280 / 席 / 月'], ['私有化许可', '¥ 120 万起'], ['年度维保', '许可费 15%']], cautions: ['报价有效期 30 天', '渠道价不得直接给到终端客户'] },
  项目复盘: { points: ['需求阶段低估了质检规则迁移量，导致第 4 周延期', '压测发现向量检索在 1500 并发时 P99 超过 2 秒，扩容后解决', '客户侧业务专家每周投入不足，用固定周会补齐', '上线后两周投诉率下降 23%'], table: [['计划周期', '8 周'], ['实际周期', '9 周'], ['需求变更', '3 次']], cautions: ['复盘结论仅供内部改进，不对客引用'] },
  发布说明: { points: ['多轮意图编排：支持可视化配置追问与槽位', '质检规则热更新，无需重启服务', '工单可双向同步到飞书', '修复坐席端偶发掉线问题'], table: [['版本', 'v5.2'], ['发布日期', '2026-10-28'], ['升级方式', '滚动升级，业务不中断']], cautions: ['私有化客户需在维护窗口内升级'] },
}
const DEFAULT_BODY: Body = { points: ['明确材料适用的客户类型和沟通阶段', '列出核心能力与可量化的效果数据', '给出下一步行动建议与负责人', '标注引用口径和更新时间'], table: [['适用阶段', '售前 / 交付'], ['维护人', '资料负责人'], ['更新频率', '每季度']], cautions: ['对外使用前确认使用范围', '数据以最新版本为准'] }
const bodyOf = (category: string) => BODIES[category] ?? DEFAULT_BODY

type Doc = KbMaterial & { _ready: boolean }
const metaOf = (d: KbMaterial) => JSON.parse(d.metadataJson || '{}') as Record<string, string | string[]>

function makeDoc(i: number, s: Seed): Doc {
  const [title, kbId, ext, product, category, scope, note, owner, department, days] = s
  const [fileType, fileTypeName] = FORMATS[ext]
  return {
    documentId: String(70_210 + i * 7),
    documentName: title,
    originalFileName: `${title}.${ext}`,
    knowledgeBaseId: kbId,
    knowledgeBaseName: libs.find(l => l.id === kbId)!.baseName,
    fileType,
    fileTypeName,
    fileSize: String(Math.round((ext === 'png' ? 2.6 : ext === 'pptx' ? 8.4 : 0.6) * 1_048_576 + i * 91_337)),
    parseStatus: '3',
    parseStatusName: '解析成功',
    indexStatus: '3',
    indexStatusName: '索引完成',
    metadataJson: JSON.stringify({ product: [product], category, owner, department, sourceScope: scope, sourceStatus: scope === '待确认' ? '待核对' : '可用', sourceNotes: note }),
    editTime: ago(days),
    updateTime: ago(days),
    _ready: true,
  }
}
const docs: Doc[] = seeds.map((s, i) => makeDoc(i, s))

/* 材料的内部可见范围（access/mode）：个人库里仅自己库的材料默认 PRIVATE，其余跟随知识库 */
const access = new Map<string, { mode: KbAccessPolicy['accessMode'], version: number }>()
function accessOf(d: KbMaterial) {
  let a = access.get(d.documentId)
  if (!a) {
    const lib = libs.find(l => l.id === d.knowledgeBaseId)
    a = { mode: lib?.owned && lib.visibility === 'PRIVATE' ? 'PRIVATE' : 'INHERIT', version: 1 }
    access.set(d.documentId, a)
  }
  return a
}

const libName = (id: string) => libs.find(l => l.id === id)?.baseName ?? ''
const visibleLib = (id: string) => libs.some(l => l.id === id && !l.archived)
const strip = ({ _ready, ...d }: Doc): KbMaterial => d
const notFound = () => new ApiError('这份材料已不可用，请刷新列表后重试。', 404)
const findDoc = (id: string) => {
  const d = docs.find(x => x.documentId === id && visibleLib(x.knowledgeBaseId))
  if (!d)
    throw notFound()
  return d
}
const values = (v: unknown) => [v].flat().filter((x): x is string => typeof x === 'string' && !!x.trim())
const facetValues = (d: KbMaterial) => {
  const m = metaOf(d)
  return { usageScope: values([m.usage_scope, m.sourceScope].flat()), product: values(m.product), category: values(m.category) }
}
const hex = (seed: string) => {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(8)
}

function markdownOf(d: KbMaterial) {
  const m = metaOf(d)
  const b = bodyOf(String(m.category))
  return [
    `# ${d.documentName}`,
    `> ${m.sourceNotes}`,
    '## 一、背景与适用范围',
    `本材料由${m.department}${m.owner}维护，适用于${values(m.product).join('、')}相关的售前沟通、方案评审与交付对齐。使用范围：${values(m.sourceScope).join('、')}。`,
    '## 二、核心内容',
    ...b.points.map(p => `- ${p}`),
    '## 三、关键数据',
    '| 项目 | 说明 |',
    '| --- | --- |',
    ...b.table.map(([k, v]) => `| ${k} | ${v} |`),
    '## 四、注意事项',
    ...b.cautions.map(c => `- ${c}`),
    '## 五、版本记录',
    `- ${d.editTime.slice(0, 10)} 更新：同步最新口径（${m.owner}）`,
  ].join('\n\n')
}

/* ---------------- 上传状态 ---------------- */
type Upload = KbUploadDraft & { startedAt?: number, attempts: number, failFirst: boolean }
const uploads = new Map<string, Upload>()
let uploadSeq = 0
const STAGES: [number, KbProcessingState, string][] = [
  [1200, 'WAIT_PARSE', '已入库，排队等待解析'],
  [3600, 'PARSING', '正在解析文档结构、表格与图片'],
  [4600, 'WAIT_INDEX', '解析完成，等待建立检索索引'],
  [7200, 'INDEXING', '正在切分并写入向量与关键词索引'],
]

/* ---------------- 会话 ---------------- */
const sessions: KbSessionDetail[] = []
const feedback = new Map<string, KbFeedback>()
let exchangeSeq = 880_100

function refOf(d: KbMaterial, n: number): KbReference {
  const b = bodyOf(String(metaOf(d).category))
  return { citationIdentity: `src-${d.documentId}-${n}`, citationEvidenceType: 'PROMPT_RENDERED_SOURCE', documentId: d.documentId, documentName: d.documentName, sectionPath: '二、核心内容', quoteText: b.points[n % b.points.length], chunkNo: String(10 + n) }
}

function pick(payload: Pick<KbStreamPayload, 'question' | 'chatMode' | 'selectedDocumentId' | 'selectedKnowledgeBaseIds'>) {
  if (payload.chatMode === 'OPEN_CHAT')
    return []
  let pool = docs.filter(d => d._ready && visibleLib(d.knowledgeBaseId))
  if (payload.selectedDocumentId)
    pool = pool.filter(d => d.documentId === payload.selectedDocumentId)
  else if (payload.selectedKnowledgeBaseIds.length)
    pool = pool.filter(d => payload.selectedKnowledgeBaseIds.includes(d.knowledgeBaseId))
  const q = payload.question
  const score = (d: KbMaterial) => {
    const text = `${d.documentName}${metaOf(d).sourceNotes}${metaOf(d).category}`
    let s = 0
    for (let i = 0; i < q.length - 1; i++) s += text.includes(q.slice(i, i + 2)) ? 1 : 0
    return s
  }
  return [...pool].sort((a, b) => score(b) - score(a)).slice(0, 2)
}

function compose(question: string, hits: KbMaterial[]) {
  if (!hits.length)
    return { answer: `这个问题没有限定资料范围，我按通用经验回答：${question.replace(/[？?]$/, '')}，建议先明确客户行业、规模和部署形态，再从知识库里找对应的方案与案例作为依据。`, references: [] as KbReference[] }
  const [a, b] = hits
  const ma = metaOf(a)
  const pa = bodyOf(String(ma.category)).points
  let answer = `根据《${a.documentName}》，${ma.sourceNotes}其中最相关的是：${pa[0]}；${pa[1]}。[1]`
  const references = [refOf(a, 0)]
  if (b) {
    const pb = bodyOf(String(metaOf(b).category)).points
    answer += `\n\n另外，《${b.documentName}》补充了一点：${pb[2] ?? pb[0]}。[2]`
    references.push(refOf(b, 2))
  }
  answer += `\n\n对外引用前请注意使用范围：《${a.documentName}》标注为「${values(ma.sourceScope).join('、')}」。`
  return { answer, references }
}

function exchange(question: string, answer: string, references: KbReference[], minutesAgo = 0): KbExchange {
  return { exchangeId: String(exchangeSeq++), question, answer, status: 'COMPLETED', createTime: new Date(BOOT - minutesAgo * 60_000).toISOString(), references }
}

function seedSession(id: string, question: string, scope: Pick<KbStreamPayload, 'chatMode' | 'selectedDocumentId' | 'selectedKnowledgeBaseIds'>, minutesAgo: number) {
  const hits = pick({ question, ...scope })
  const { answer, references } = compose(question, hits)
  const ex = exchange(question, answer, references, minutesAgo)
  const doc = scope.selectedDocumentId ? docs.find(d => d.documentId === scope.selectedDocumentId) : undefined
  sessions.push({
    conversationId: id,
    chatMode: scope.chatMode,
    latestTurnStatus: 'COMPLETED',
    latestExchangeId: ex.exchangeId,
    latestUserMessage: question,
    latestAssistantMessage: answer,
    running: false,
    messageCount: 2,
    updatedAt: ex.createTime,
    selectedDocumentId: scope.selectedDocumentId ?? '',
    selectedDocumentName: doc?.documentName ?? '',
    selectedKnowledgeBaseIds: scope.selectedKnowledgeBaseIds,
    selectedKnowledgeBaseNames: scope.selectedKnowledgeBaseIds.map(libName),
    knowledgeBaseSelectionMode: scope.selectedKnowledgeBaseIds.length ? 'SELECTED' : 'ALL',
    exchanges: [ex],
  })
}
seedSession('conv-gpu', '翼飞客服私有化部署需要多少 GPU？', { chatMode: 'AUTO_DOCUMENT', selectedDocumentId: null, selectedKnowledgeBaseIds: [] }, 42)
seedSession('conv-golive', '上线前 48 小时要检查哪些事项？', { chatMode: 'DOCUMENT', selectedDocumentId: docs[9].documentId, selectedKnowledgeBaseIds: ['kb-fde'] }, 60 * 26)
seedSession('conv-quote', '私有化报价的折扣审批红线是多少？', { chatMode: 'AUTO_DOCUMENT', selectedDocumentId: null, selectedKnowledgeBaseIds: ['kb-contract'] }, 60 * 50)

const toPersonal = (l: Lib): KbPersonalLibrary => ({
  id: l.id,
  name: l.baseName,
  description: l.description,
  visibility: l.visibility,
  policyVersion: String(l.policyVersion),
  archived: l.archived,
  documentCount: String(docs.filter(d => d.knowledgeBaseId === l.id).length),
})
const ownedLib = (id: string) => {
  const l = libs.find(x => x.id === id && x.owned)
  if (!l)
    throw new ApiError('只能管理自己的知识库', 403)
  return l
}

/* ---------------- 对外：每个接口一个方法 ---------------- */
export const kbDb = {
  profile: (): KbProfile => ({ userId: 'u-yeyuan', displayName: '叶源', organizationName: '商汤科技 · FDE', roleName: '成员' }),

  libraries: (): KbLibrary[] => libs.filter(l => !l.archived).map(l => {
    const n = docs.filter(d => d.knowledgeBaseId === l.id)
    return { id: l.id, baseName: l.baseName, description: l.description, visibility: l.visibility, documentCount: String(n.length), retrievableDocumentCount: String(n.filter(d => d._ready).length), isDefault: '0', editTime: l.editTime }
  }),

  documentPage(q: KbDocumentQuery): KbPage<KbMaterial> {
    const kw = (q.keyword ?? '').trim().toLowerCase()
    const rows = docs
      .filter(d => visibleLib(d.knowledgeBaseId))
      .filter(d => !q.knowledgeBaseId || d.knowledgeBaseId === q.knowledgeBaseId)
      .filter(d => !kw || `${d.documentName} ${d.originalFileName}`.toLowerCase().includes(kw))
      .filter(d => (['usageScope', 'product', 'category'] as const).every(k => !q[k] || facetValues(d)[k].includes(q[k]!)))
      .filter(d => !q.accessMode || accessOf(d).mode === q.accessMode)
      .sort((a, b) => b.editTime.localeCompare(a.editTime))
    const start = (q.pageNo - 1) * q.pageSize
    return { pageNo: String(q.pageNo), pageSize: String(q.pageSize), total: String(rows.length), records: rows.slice(start, start + q.pageSize).map(strip) }
  },

  facets(knowledgeBaseId?: string): KbFilterOptions {
    const scoped = docs.filter(d => visibleLib(d.knowledgeBaseId) && (!knowledgeBaseId || d.knowledgeBaseId === knowledgeBaseId))
    const count = (key: 'usageScope' | 'product' | 'category'): KbFacetOption[] => {
      const m = new Map<string, number>()
      scoped.forEach(d => facetValues(d)[key].forEach(v => m.set(v, (m.get(v) ?? 0) + 1)))
      return [...m].sort((a, b) => b[1] - a[1]).map(([value, c]) => ({ value, count: String(c) }))
    }
    const modes = new Map<string, number>()
    scoped.forEach(d => modes.set(accessOf(d).mode, (modes.get(accessOf(d).mode) ?? 0) + 1))
    const accessModes = (['PRIVATE', 'INHERIT', 'TENANT', 'CUSTOM'] as const).filter(k => modes.has(k)).map(k => ({ value: k, count: String(modes.get(k)) }))
    return { usageScopes: count('usageScope'), products: count('product'), categories: count('category'), accessModes }
  },

  document: (id: string) => strip(findDoc(id)),

  overview(id: string): KbOverview {
    const d = findDoc(id)
    const m = metaOf(d)
    if (!d._ready)
      return { documentId: id, summary: '', summarySource: 'NONE', keyPoints: [], truncated: false, status: 'NOT_READY' }
    return { documentId: id, summary: `${m.sourceNotes}适合在售前沟通、方案评审和交付对齐时引用，具体口径以最新版本为准。`, summarySource: 'PARSED_EXCERPT', keyPoints: bodyOf(String(m.category)).points.slice(0, 3), truncated: false, status: 'READY' }
  },

  preview(id: string): KbPreview {
    const d = findDoc(id)
    const base = { documentId: id, version: hex(id), truncated: false }
    if (d.fileType === '7')
      return { ...base, kind: 'IMAGE', status: 'READY', content: '', contentSource: 'NONE', contentType: 'image/png' }
    if (!d._ready)
      return { ...base, kind: 'NONE', status: 'CONVERTING', content: '', contentSource: 'NONE', contentType: '' }
    return { ...base, kind: 'MARKDOWN', status: 'READY', content: markdownOf(d), contentSource: d.fileType === '5' ? 'ORIGINAL' : 'PARSED', contentType: 'text/markdown;charset=UTF-8' }
  },

  versions(id: string): KbVersion[] {
    const d = findDoc(id)
    const list: KbVersion[] = [{ contentVersionId: hex(id), versionNo: '2', current: true, originalName: d.originalFileName, createdAt: d.editTime }]
    if (Number(id) % 2 === 0)
      list.push({ contentVersionId: hex(`${id}-v1`), versionNo: '1', current: false, originalName: d.originalFileName, createdAt: new Date(Date.parse(d.editTime) - 9 * DAY).toISOString() })
    return list
  },

  policy(id: string): KbAccessPolicy {
    const d = findDoc(id)
    const lib = libs.find(l => l.id === d.knowledgeBaseId)!
    const a = accessOf(d)
    return { documentId: id, accessMode: a.mode, policyVersion: String(a.version), canManage: lib.owned, owner: lib.owned, permissions: lib.owned ? ['READ', 'CONTRIBUTE', 'SHARE', 'MANAGE', 'DOWNLOAD'] : ['READ', 'SHARE', 'DOWNLOAD'] }
  },
  /** 与 DocumentPolicyService.updateMode 的校验一致 */
  updateAccessMode(id: string, mode: KbAccessPolicy['accessMode'], expected: string): KbAccessPolicy {
    const d = findDoc(id)
    const lib = libs.find(l => l.id === d.knowledgeBaseId)!
    const a = accessOf(d)
    if (String(a.version) !== expected)
      throw new ApiError('权限已被其他人修改，请刷新后重试。', 409)
    if (!lib.owned)
      throw new ApiError(mode === 'PRIVATE' ? '只有资料所有者可以将资料设为仅自己。' : '只有资料所有者可以更改公开或继承范围。', 403)
    // 原后端：父知识库为仅自己时只能设 PRIVATE（409）。新前端允许单份材料单独开放，待后端放开该校验。
    a.mode = mode
    a.version++
    return kbDb.policy(id)
  },
  updateUsageScope(id: string, scope: string): KbMaterial {
    const d = findDoc(id)
    if (!libs.find(l => l.id === d.knowledgeBaseId)?.owned)
      throw new ApiError('只能修改自己知识库里的材料。', 403)
    const m = metaOf(d)
    delete m.usage_scope
    m.sourceScope = scope
    m.sourceStatus = scope === '待确认' ? '待核对' : '可用'
    d.metadataJson = JSON.stringify(m)
    d.editTime = nowIso()
    return strip(d)
  },

  originalBlob: (id: string) => new Blob([markdownOf(findDoc(id))], { type: 'text/markdown' }),

  documentOptions: (): KbDocumentOption[] => docs.filter(d => d._ready && visibleLib(d.knowledgeBaseId)).map(d => ({ documentId: d.documentId, documentName: d.documentName, knowledgeBaseId: d.knowledgeBaseId })),

  /* 我的知识库 */
  personalLibraries: () => libs.filter(l => l.owned).map(toPersonal),
  createLibrary(baseName: string): KbLibrary {
    if (libs.some(l => l.baseName === baseName.trim()))
      throw new ApiError('已有同名知识库，换个名称再试。', 409)
    const l: Lib = { id: mockId('kb'), baseName: baseName.trim(), description: '', visibility: 'PRIVATE', owned: true, archived: false, policyVersion: 1, editTime: nowIso() }
    libs.push(l)
    return { id: l.id, baseName: l.baseName, documentCount: '0', visibility: 'PRIVATE', editTime: l.editTime }
  },
  renameLibrary(id: string, name: string) {
    const l = ownedLib(id)
    l.baseName = name.trim()
    l.policyVersion++
    docs.forEach(d => d.knowledgeBaseId === id && (d.knowledgeBaseName = l.baseName))
    return toPersonal(l)
  },
  setArchived(id: string, archived: boolean) {
    const l = ownedLib(id)
    if (archived && l.visibility !== 'PRIVATE')
      throw new ApiError('只支持归档「仅自己」可见的知识库，请先收回共享。', 409)
    l.archived = archived
    l.policyVersion++
    return toPersonal(l)
  },
  makePrivate(id: string) {
    const l = ownedLib(id)
    l.visibility = 'PRIVATE'
    l.policyVersion++
    return toPersonal(l)
  },
  deleteLibrary(id: string) {
    ownedLib(id)
    libs.splice(libs.findIndex(l => l.id === id), 1)
    for (let i = docs.length - 1; i >= 0; i--) {
      if (docs[i].knowledgeBaseId === id)
        docs.splice(i, 1)
    }
    return { success: true }
  },

  /* 上传 */
  uploadOptions: (): KbUploadOptions => ({
    aiEnabled: false,
    targets: libs.filter(l => !l.archived && (l.owned || l.id === 'kb-fde' || l.id === 'kb-presales')).map(l => ({ id: l.id, name: l.baseName })),
    products: ['翼飞客服', 'RaccoonX', 'SalesBuddy', '平台'].map((label, i) => ({ id: `p${i}`, label, revision: '1' })),
    categories: ['交付方案', '产品手册', '部署方案', '项目复盘', '报价模板'].map((label, i) => ({ id: `c${i}`, label, revision: '1' })),
  }),
  uploads: () => [...uploads.values()].map(({ startedAt, attempts, failFirst, ...u }) => u),
  createUpload(fileName: string, size: number): KbUploadDraft {
    uploadSeq++
    const form: KbUploadForm = { knowledgeBaseId: '', title: fileName.replace(/\.[^.]+$/, ''), products: [], categories: [], description: '', tags: [], usageScope: '待确认', editedFields: [] }
    const u: Upload = { id: mockId('upl'), fileName, fileSize: String(size), state: 'DRAFT', formRevision: '1', contentVersion: hex(fileName + uploadSeq), form, attempts: 0, failFirst: uploadSeq % 3 === 0 }
    uploads.set(u.id, u)
    return kbDb.uploads().find(x => x.id === u.id)!
  },
  saveUpload(id: string, form: KbUploadForm) {
    const u = uploads.get(id)!
    u.form = form
    u.formRevision = String(Number(u.formRevision) + 1)
    return kbDb.uploads().find(x => x.id === id)!
  },
  confirmUpload(id: string) {
    const u = uploads.get(id)!
    if (!u.form.knowledgeBaseId)
      throw new ApiError('请选择要放入的知识库', 400)
    if (u.state !== 'CONFIRMED') {
      const ext = (u.fileName.split('.').pop() ?? '').toLowerCase()
      const fmt = FORMATS[ext === 'doc' ? 'docx' : ext === 'xls' ? 'xlsx' : ext === 'ppt' ? 'pptx' : ['jpg', 'jpeg', 'webp'].includes(ext) ? 'png' : ext] ?? ['9', '文件']
      const doc: Doc = {
        ...makeDoc(0, [u.form.title, u.form.knowledgeBaseId, 'md', u.form.products[0] ?? '平台', u.form.categories[0] ?? '其他资料', u.form.usageScope, '新上传的材料，解析完成后会生成摘要。', '叶源', 'FDE 交付部', 0]),
        documentId: String(90_000 + uploadSeq * 13 + Math.floor(Math.random() * 7)),
        originalFileName: u.fileName,
        fileType: fmt[0],
        fileTypeName: fmt[1],
        fileSize: u.fileSize,
        parseStatus: '1',
        parseStatusName: '等待解析',
        indexStatus: '1',
        indexStatusName: '等待索引',
        _ready: false,
      }
      docs.unshift(doc)
      u.state = 'CONFIRMED'
      u.result = { documentId: doc.documentId }
      u.startedAt = Date.now()
      u.attempts = 1
    }
    return kbDb.uploads().find(x => x.id === id)!
  },
  cancelUpload(id: string) {
    const u = uploads.get(id)!
    u.state = 'CANCELLED'
    return kbDb.uploads().find(x => x.id === id)!
  },
  processing(id: string): KbProcessing {
    const u = uploads.get(id)
    if (!u?.startedAt)
      throw new ApiError('材料尚未入库', 404)
    const t = Date.now() - u.startedAt
    const doc = docs.find(d => d.documentId === u.result?.documentId)
    const stage = STAGES.find(([until]) => t < until)
    if (u.failFirst && u.attempts === 1 && t >= STAGES[0][0]) {
      if (doc)
        Object.assign(doc, { parseStatus: '4', parseStatusName: '解析失败' })
      return { state: 'FAILED', message: '第 3 页是扫描图片，文字识别失败。可以重试处理，或换成可复制文字的版本。', retryAllowed: true }
    }
    if (stage) {
      if (doc && stage[1] === 'INDEXING')
        Object.assign(doc, { parseStatus: '3', parseStatusName: '解析成功', indexStatus: '2', indexStatusName: '索引中' })
      else if (doc && stage[1] === 'PARSING')
        Object.assign(doc, { parseStatus: '2', parseStatusName: '解析中' })
      return { state: stage[1], message: stage[2], retryAllowed: false }
    }
    if (doc && !doc._ready)
      Object.assign(doc, { parseStatus: '3', parseStatusName: '解析成功', indexStatus: '3', indexStatusName: '索引完成', _ready: true, editTime: nowIso() })
    return { state: 'READY', message: '已可用于问答和检索', retryAllowed: false }
  },
  retryProcessing(id: string) {
    const u = uploads.get(id)!
    u.attempts++
    u.startedAt = Date.now()
    return kbDb.processing(id)
  },

  /* 分享 */
  shareEligibility(id: string): KbShareEligibility {
    const scope = values(metaOf(findDoc(id)).sourceScope)
    if (scope.includes('仅内部'))
      return { allowed: false, reason: '这份资料标注为「仅内部」，不能对客分享。' }
    if (scope.includes('待确认'))
      return { allowed: false, reason: '使用范围还未确认，请联系资料负责人核对后再分享。' }
    return { allowed: true, reason: 'OK' }
  },
  createShare: (): KbShareCreated => ({ id: mockId('share'), path: `/s/${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}` }),

  /* 问答 */
  sessionPage(): KbSessionPage {
    const list = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ exchanges, ...s }) => s)
    return { pageNo: '1', pageSize: '50', totalSize: String(list.length), totalPages: '1', sessions: list }
  },
  session(id: string) {
    const s = sessions.find(x => x.conversationId === id)
    if (!s)
      throw new ApiError('会话不存在或已删除', 404)
    return s
  },
  deleteSession(id: string) {
    const i = sessions.findIndex(x => x.conversationId === id)
    if (i >= 0)
      sessions.splice(i, 1)
    return { success: true }
  },
  planAnswer(payload: KbStreamPayload) {
    const hits = pick(payload)
    const { answer, references } = compose(payload.question, hits)
    const scopeText = payload.selectedDocumentId ? '当前材料' : payload.selectedKnowledgeBaseIds.length ? payload.selectedKnowledgeBaseIds.map(libName).join('、') : '全部可访问的知识库'
    return { status: payload.chatMode === 'OPEN_CHAT' ? '正在组织回答' : `正在${scopeText}中查找证据`, thinking: hits.length ? `找到 ${hits.length} 份相关材料：${hits.map(h => `《${h.documentName}》`).join('、')}` : '未限定资料范围，按通用经验回答', answer, references }
  },
  commitAnswer(payload: KbStreamPayload, answer: string, references: KbReference[]) {
    const ex = exchange(payload.question, answer, references)
    let s = sessions.find(x => x.conversationId === payload.conversationId)
    if (!s) {
      const doc = docs.find(d => d.documentId === payload.selectedDocumentId)
      s = { conversationId: payload.conversationId, chatMode: payload.chatMode, latestTurnStatus: 'COMPLETED', latestExchangeId: '', latestUserMessage: '', latestAssistantMessage: '', running: false, messageCount: 0, updatedAt: '', selectedDocumentId: payload.selectedDocumentId ?? '', selectedDocumentName: doc?.documentName ?? '', selectedKnowledgeBaseIds: payload.selectedKnowledgeBaseIds, selectedKnowledgeBaseNames: payload.selectedKnowledgeBaseIds.map(libName), knowledgeBaseSelectionMode: payload.knowledgeBaseSelectionMode, exchanges: [] }
      sessions.push(s)
    }
    s.exchanges.push(ex)
    Object.assign(s, { latestExchangeId: ex.exchangeId, latestUserMessage: ex.question, latestAssistantMessage: answer, messageCount: s.exchanges.length * 2, updatedAt: ex.createTime })
  },
  myFeedback: (exchangeId: string) => feedback.get(exchangeId) ?? null,
  vote(exchangeId: string, rating: KbFeedback['rating']): KbFeedback {
    const f: KbFeedback = { feedbackId: String(5_000 + feedback.size + 1), rating, active: true, reasons: [], commentCount: '0' }
    feedback.set(exchangeId, f)
    return f
  },
  feedbackReason(exchangeId: string, reasons: KbFeedbackReason[]): KbFeedback {
    const f = feedback.get(exchangeId)!
    f.reasons = reasons
    f.commentCount = String(Number(f.commentCount) + 1)
    return f
  },
  revokeFeedback(exchangeId: string) {
    feedback.delete(exchangeId)
    return null
  },
}
