/*
  知识库模块接口层（Raccoon KnowledgeBase 后端，backend: 'kb'）。
  路径、请求体字段与知识库前端 vue/src/api/api.js 保持一致：
  - JSON 接口统一返回信封 { code: '0', message, data }，这里解包后只把 data 交给页面；
  - 数字型 ID / 计数一律按字符串传输（后端 MVC 把 long 序列化成字符串）。
  mock 数据与内存状态在 ./mock/knowledge.ts。
*/
import type { RequestSpec, StreamEvent } from './http'
import { API_MODE, ApiError, mockTextStream, request, requestBlob, stream } from './http'
import { kbDb } from './mock/knowledge'

/* ---------------- 类型 ---------------- */

export type KbProfile = { userId: string, displayName: string, organizationName: string, roleName?: string, permissions?: { tenantContentAdmin?: boolean, knowledgeWrite?: boolean } }

/** 可访问的知识库（工作台左栏） */
export type KbLibrary = {
  id: string
  baseName: string
  description?: string
  documentCount: string
  retrievableDocumentCount?: string
  visibility?: KbVisibility
  isDefault?: string
  editTime?: string
}
export type KbVisibility = 'PRIVATE' | 'TENANT' | 'CUSTOM'
/**
  listKnowledgeBases() 的返回项：在后端 KbLibrary 上补齐页面/选择器常用字段。
  - name / count：baseName / documentCount 的便捷别名（count 为数字）
  - ownedByMe：是否「我的库」（id 出现在 GET /materials/libraries 里）
*/
export type KbLibraryItem = KbLibrary & { name: string, count: number, ownedByMe: boolean }

/** 材料（文档）记录；产品/分类/使用范围等放在 metadataJson 里 */
export type KbMaterial = {
  documentId: string
  documentName: string
  originalFileName: string
  knowledgeBaseId: string
  knowledgeBaseName: string
  fileType: string
  fileTypeName: string
  fileSize: string
  parseStatus: string
  parseStatusName: string
  indexStatus: string
  indexStatusName: string
  metadataJson: string
  editTime: string
  updateTime?: string
}
export type KbMaterialMetadata = {
  product?: string | string[]
  category?: string | string[]
  owner?: string
  department?: string
  sourceScope?: string | string[]
  usage_scope?: string | string[]
  sourceStatus?: string
  sourceNotes?: string
  sourceTitle?: string
  description?: string
}

export type KbPage<T> = { pageNo: string, pageSize: string, total: string, records: T[] }
export type KbDocumentQuery = {
  keyword?: string
  knowledgeBaseId?: string
  usageScope?: string
  product?: string
  category?: string
  /** 谁能看到：PRIVATE / INHERIT / TENANT / CUSTOM（RaccoonX 扩展，待后端支持） */
  accessMode?: string
  pageNo: number
  pageSize: number
}
export type KbFacetOption = { value: string, count: string }
export type KbFilterOptions = { usageScopes: KbFacetOption[], products: KbFacetOption[], categories: KbFacetOption[], /** RaccoonX 扩展：按「谁能看到」计数 */ accessModes?: KbFacetOption[] }

export type KbOverview = {
  documentId: string
  summary: string
  summarySource: 'SOURCE_DESCRIPTION' | 'PARSED_EXCERPT' | 'NONE'
  keyPoints: string[]
  truncated: boolean
  status: 'READY' | 'NOT_READY' | 'UNAVAILABLE'
}
export type KbPreview = {
  documentId: string
  kind: 'MARKDOWN' | 'TEXT' | 'PDF' | 'OFFICE' | 'IMAGE' | 'SHEET' | 'MEDIA' | 'NONE'
  status: 'READY' | 'CONVERTING' | 'UNAVAILABLE'
  /** 64 位十六进制内容版本，下载/导出时必须带上 */
  version: string
  content: string
  contentSource: 'ORIGINAL' | 'PARSED' | 'RENDITION' | 'NONE'
  truncated: boolean
  contentType: string
  canDownload?: boolean
}
export type KbVersion = { contentVersionId: string, versionNo: string, current: boolean, originalName: string, createdAt: string }
export type KbPermission = 'READ' | 'CONTRIBUTE' | 'SHARE' | 'MANAGE' | 'DOWNLOAD'
export type KbAccessPolicy = {
  documentId: string
  accessMode: 'PRIVATE' | 'INHERIT' | 'TENANT' | 'CUSTOM'
  policyVersion: string
  canManage: boolean
  owner?: boolean
  permissions?: KbPermission[]
}
export type KbAttachments = { attachments: { documentId: string, title: string, fileTypeName: string }[], canAdd: boolean }

/** 我的知识库（个人库） */
export type KbPersonalLibrary = {
  id: string
  name: string
  description: string
  visibility: KbVisibility
  policyVersion: string
  archived: boolean
  documentCount: string
}

/* 上传 */
export type KbUploadOptions = {
  aiEnabled: boolean
  targets: { id: string, name: string }[]
  products: { id: string, label: string, revision: string }[]
  categories: { id: string, label: string, revision: string }[]
}
export type KbUploadForm = {
  knowledgeBaseId: string
  title: string
  products: string[]
  categories: string[]
  description: string
  tags: string[]
  usageScope: string
  editedFields: string[]
}
export type KbUploadDraft = {
  id: string
  fileName: string
  fileSize: string
  state: 'DRAFT' | 'CONFIRMED' | 'CANCELLED'
  formRevision: string
  contentVersion: string
  form: KbUploadForm
  attachmentToDocumentId?: string
  result?: { documentId: string }
}
export type KbProcessingState = 'WAIT_PARSE' | 'PARSING' | 'WAIT_INDEX' | 'INDEXING' | 'READY' | 'FAILED' | 'REPLACED'
export type KbProcessing = { state: KbProcessingState, message: string, retryAllowed: boolean }

/* 分享 */
export type KbShareEligibility = { allowed: boolean, reason: string }
export type KbShareSettings = { defaultDays: number, maxDays: number, linkCopy: boolean }
export type KbShareCreated = { id: string, path: string }

/* 问材料 */
export type KbChatMode = 'DOCUMENT' | 'AUTO_DOCUMENT' | 'OPEN_CHAT'
export type KbSelectionMode = 'ALL' | 'SELECTED' | 'NONE'
export type KbReference = {
  citationIdentity: string
  citationEvidenceType?: string
  documentId?: string
  documentName: string
  sectionPath?: string
  quoteText?: string
  chunkNo?: string
}
export type KbExchange = {
  exchangeId: string
  question: string
  answer: string
  status: 'COMPLETED' | 'FAILED' | 'RUNNING' | 'STOPPED'
  errorMessage?: string
  createTime: string
  references: KbReference[]
}
export type KbSession = {
  conversationId: string
  chatMode: KbChatMode
  latestTurnStatus: string
  latestExchangeId: string
  latestUserMessage: string
  latestAssistantMessage: string
  running: boolean
  messageCount: number
  updatedAt: string
  selectedDocumentId: string
  selectedDocumentName: string
  selectedKnowledgeBaseIds: string[]
  selectedKnowledgeBaseNames: string[]
  knowledgeBaseSelectionMode: KbSelectionMode
}
export type KbSessionDetail = KbSession & { exchanges: KbExchange[] }
export type KbSessionPage = { pageNo: string, pageSize: string, totalSize: string, totalPages: string, sessions: KbSession[] }
export type KbDocumentOption = { documentId: string, documentName: string, knowledgeBaseId: string }
export type KbStreamPayload = {
  question: string
  conversationId: string
  chatMode: KbChatMode
  knowledgeBaseSelectionMode: KbSelectionMode
  selectedKnowledgeBaseIds: string[]
  selectedDocumentId: string | null
}
/** SSE 事件：status 进度 / thinking 思路 / text 正文增量 / reference 引用 / modelNotice 模型提示 */
export type KbStreamEvent = StreamEvent & { type: 'status' | 'thinking' | 'text' | 'reference' | 'modelNotice', content: unknown }
export type KbFeedbackRating = 'UP' | 'DOWN'
export type KbFeedbackReason = 'IRRELEVANT' | 'BAD_CITATION' | 'OUTDATED' | 'INCOMPLETE' | 'OTHER'
export type KbFeedback = { feedbackId: string, rating: KbFeedbackRating, active: boolean, reasons: KbFeedbackReason[], commentCount: string }

/* ---------------- 请求封装 ---------------- */

type Envelope<T> = { code: string | number, message?: string, data: T }

/** 知识库 JSON 接口：解开 { code, data } 信封，code 非 '0' 视为失败 */
async function kb<T>(spec: Omit<RequestSpec, 'backend'>, mock: () => T | Promise<T>): Promise<T> {
  const env = await request<Envelope<T>>({ ...spec, backend: 'kb' }, async () => ({ code: '0', data: await mock() }))
  if (String(env?.code ?? '') !== '0')
    throw new ApiError(env?.message || '请求失败', Number(env?.code) || 500)
  return env.data
}
const enc = encodeURIComponent

/* ---------------- 身份 ---------------- */

/** GET /admin/auth/me 当前账号与组织（左栏「当前组织」） */
export const getProfile = () => kb<KbProfile>({ method: 'GET', path: '/admin/auth/me' }, () => kbDb.profile())

/* ---------------- 工作台：知识库、材料 ---------------- */

/** POST /manage/knowledge/base/list 当前账号可访问的知识库（原始返回） */
export const listAccessibleLibraries = () =>
  kb<KbLibrary[]>({ method: 'POST', path: '/manage/knowledge/base/list', body: {} }, () => kbDb.libraries())

/**
  可访问的知识库 + 「是否我的库」：并行请求
  POST /manage/knowledge/base/list 与 GET /materials/libraries，按 id 合并出 ownedByMe。
  个人库接口失败时不影响列表（ownedByMe 全为 false）。排序：我的库在前，组内按最近更新。
  工作台左栏和 Agent 配置里的 KbLibraryPicker 都用它。
*/
export async function listKnowledgeBases(): Promise<KbLibraryItem[]> {
  const [all, mine] = await Promise.all([listAccessibleLibraries(), listPersonalLibraries().catch(() => [] as KbPersonalLibrary[])])
  const owned = new Set(mine.filter(l => !l.archived).map(l => l.id))
  return all
    .map(l => ({ ...l, name: l.baseName, count: Number(l.documentCount) || 0, ownedByMe: owned.has(l.id) }))
    .sort((a, b) => Number(b.ownedByMe) - Number(a.ownedByMe) || (b.editTime ?? '').localeCompare(a.editTime ?? '') || b.count - a.count)
}

/** POST /manage/document/page/query 材料分页（关键词 + 知识库 + 产品/分类/使用范围筛选） */
export const queryDocumentPage = (q: KbDocumentQuery, signal?: AbortSignal) =>
  kb<KbPage<KbMaterial>>({
    method: 'POST',
    path: '/manage/document/page/query',
    signal,
    body: { keyword: q.keyword, knowledgeBaseId: q.knowledgeBaseId, usageScope: q.usageScope, product: q.product, category: q.category, pageNo: String(q.pageNo), pageSize: String(q.pageSize) },
  }, () => kbDb.documentPage(q))

/** POST /manage/document/filter/options/query 当前范围的筛选项及文件数 */
export const queryDocumentFilterOptions = (knowledgeBaseId?: string) =>
  kb<KbFilterOptions>({ method: 'POST', path: '/manage/document/filter/options/query', body: knowledgeBaseId ? { knowledgeBaseId } : {} }, () => kbDb.facets(knowledgeBaseId))

/** POST /manage/document/detail/query 材料详情 */
export const queryDocumentDetail = (documentId: string) =>
  kb<KbMaterial>({ method: 'POST', path: '/manage/document/detail/query', body: { documentId } }, () => kbDb.document(documentId))

/** GET /materials/{id}/overview 材料概览（摘要 + 要点） */
export const queryMaterialOverview = (documentId: string) =>
  kb<KbOverview>({ method: 'GET', path: `/materials/${enc(documentId)}/overview` }, () => kbDb.overview(documentId))

/** GET /materials/{id}/preview 在线预览内容（Markdown/文本直接返回正文） */
export const queryMaterialPreview = (documentId: string) =>
  kb<KbPreview>({ method: 'GET', path: `/materials/${enc(documentId)}/preview` }, () => kbDb.preview(documentId))

/** GET /materials/{id}/versions 内容版本列表 */
export const listMaterialVersions = (documentId: string) => API_MODE === 'live' ? queryMaterialPreview(documentId).then(p => p.version ? [{ contentVersionId: p.version, versionNo: '当前', current: true, originalName: '', createdAt: '' }] : []) :
  kb<KbVersion[]>({ method: 'GET', path: `/materials/${enc(documentId)}/versions` }, () => kbDb.versions(documentId))

/** POST /manage/document/access/snapshot?documentId= 材料访问权限快照 */
export const getDocumentPolicy = (documentId: string): Promise<KbAccessPolicy> => API_MODE === 'live' ? queryMaterialPreview(documentId).then(p => ({ documentId, accessMode: 'INHERIT' as const, policyVersion: '', canManage: false, permissions: p.canDownload ? ['DOWNLOAD' as const] : [] })) :
  kb<KbAccessPolicy>({ method: 'POST', path: '/manage/document/access/snapshot', query: { documentId }, body: {} }, () => kbDb.policy(documentId))

/**
  POST /manage/document/access/mode/update 修改材料的内部可见范围（需 SHARE 权限）。
  accessMode：PRIVATE 仅自己（仅所有者可设）/ INHERIT 跟随知识库 / TENANT 公司内可见；CUSTOM 需再逐个授权，这里不提供。
  原后端在父知识库为仅自己时只允许 PRIVATE（409）；新前端允许单份材料单独开放，需后端放开该校验。返回新的权限快照。
*/
export const updateDocumentAccessMode = (documentId: string, accessMode: KbAccessPolicy['accessMode'], expectedPolicyVersion: string) =>
  kb<KbAccessPolicy>({ method: 'POST', path: '/manage/document/access/mode/update', body: { documentId, accessMode, expectedPolicyVersion } }, () => kbDb.updateAccessMode(documentId, accessMode, expectedPolicyVersion))

/**
  POST /materials/{id}/usage-scope 修改材料的「对外使用范围」标注（写入 metadataJson.usage_scope）。
  注意：知识库后端暂无此接口（上传时在 uploads/{id}/form 的 usageScope 里填写），这里是新前端提出的接口，待后端补齐。
*/
export const updateMaterialUsageScope = (documentId: string, usageScope: string) =>
  kb<KbMaterial>({ method: 'POST', path: `/materials/${enc(documentId)}/usage-scope`, body: { usageScope } }, () => kbDb.updateUsageScope(documentId, usageScope))

/** GET /materials/{id}/attachments 附件 */
export const listMaterialAttachments = (documentId: string) => API_MODE === 'live' ? Promise.resolve({ attachments: [], canAdd: false }) :
  kb<KbAttachments>({ method: 'GET', path: `/materials/${enc(documentId)}/attachments` }, () => ({ attachments: [], canAdd: false }))

/** GET /materials/{id}/original?version= 下载原件（需 DOWNLOAD 权限，服务端审计） */
export const downloadMaterialOriginal = (documentId: string, version: string) =>
  requestBlob({ method: 'GET', backend: 'kb', path: `/materials/${enc(documentId)}/original`, query: { version } }, () => kbDb.originalBlob(documentId))
/** GET /materials/{id}/rendition 读取 Word/PPT/Excel 转码后的在线预览文件 */
export const downloadMaterialRendition = (documentId: string, version: string) =>
  requestBlob({ method: 'GET', backend: 'kb', path: `/materials/${enc(documentId)}/rendition`, query: { version } }, () => kbDb.originalBlob(documentId))

/* ---------------- 我的知识库 ---------------- */

/** GET /materials/libraries 我的知识库列表 */
export const listPersonalLibraries = () => API_MODE === 'live' ? Promise.resolve([] as KbPersonalLibrary[]) :
  kb<KbPersonalLibrary[]>({ method: 'GET', path: '/materials/libraries' }, () => kbDb.personalLibraries())

/** POST /knowledge-bases 按公开集成协议创建当前账号的私有知识库 */
export const createLibrary = (baseName: string) =>
  kb<{ id: string }>({ method: 'POST', path: '/knowledge-bases', body: { name: baseName } }, () => kbDb.createLibrary(baseName))

/** POST /materials/libraries/{id}/rename 改名 */
export const renameLibrary = (id: string, body: { expectedPolicyVersion: string, name: string, description: string }) =>
  kb<KbPersonalLibrary>({ method: 'POST', path: `/materials/libraries/${enc(id)}/rename`, body }, () => kbDb.renameLibrary(id, body.name))

/** POST /materials/libraries/{id}/archive 归档 */
export const archiveLibrary = (id: string, expectedPolicyVersion: string) =>
  kb<KbPersonalLibrary>({ method: 'POST', path: `/materials/libraries/${enc(id)}/archive`, body: { expectedPolicyVersion } }, () => kbDb.setArchived(id, true))

/** POST /materials/libraries/{id}/restore 恢复 */
export const restoreLibrary = (id: string, expectedPolicyVersion: string) =>
  kb<KbPersonalLibrary>({ method: 'POST', path: `/materials/libraries/${enc(id)}/restore`, body: { expectedPolicyVersion } }, () => kbDb.setArchived(id, false))

/** POST /manage/knowledge/access/visibility/update 收回共享，设为仅自己 */
export const makeLibraryPrivate = (knowledgeBaseId: string, expectedPolicyVersion: string) =>
  kb<KbPersonalLibrary>({ method: 'POST', path: '/manage/knowledge/access/visibility/update', body: { knowledgeBaseId, visibilityCode: 'PRIVATE', expectedPolicyVersion } }, () => kbDb.makePrivate(knowledgeBaseId))

/** POST /manage/knowledge/base/delete 删除知识库（界面上只对已归档的个人库开放） */
export const deleteLibrary = (id: string) =>
  kb<{ success: boolean }>({ method: 'POST', path: '/manage/knowledge/base/delete', body: { id } }, () => kbDb.deleteLibrary(id))

/* ---------------- 上传材料 ---------------- */

/** GET /materials/uploads/options 可上传的目标知识库、产品、分类 */
export const getUploadOptions = () => API_MODE === 'live' ? listAccessibleLibraries().then(libs => ({ aiEnabled: false, targets: libs.map(l => ({ id: l.id, name: l.baseName })), products: [], categories: [] })) :
  kb<KbUploadOptions>({ method: 'GET', path: '/materials/uploads/options' }, () => kbDb.uploadOptions())

/** GET /materials/uploads 我的上传草稿 */
export const listUploads = () => kb<KbUploadDraft[]>({ method: 'GET', path: '/materials/uploads' }, () => kbDb.uploads())

/** POST /materials/uploads（multipart：file、uploadKey、可选 attachmentToDocumentId）上传文件，生成草稿 */
export function createUpload(file: File, uploadKey: string, attachmentToDocumentId = '') {
  const form = new FormData()
  form.append('file', file)
  form.append('uploadKey', uploadKey)
  if (attachmentToDocumentId)
    form.append('attachmentToDocumentId', attachmentToDocumentId)
  return kb<KbUploadDraft>({ method: 'POST', path: '/materials/uploads', form }, () => kbDb.createUpload(file.name, file.size))
}

/** POST /materials/uploads/{id}/form 保存草稿表单（目标库、标题、使用范围等） */
export const saveUploadForm = (id: string, body: { expectedRevision: string, contentVersion: string, form: KbUploadForm }) =>
  kb<KbUploadDraft>({ method: 'POST', path: `/materials/uploads/${enc(id)}/form`, body }, () => kbDb.saveUpload(id, body.form))

/** POST /materials/uploads/{id}/confirm 确认入库（幂等键防重复） */
export const confirmUpload = (id: string, body: { expectedRevision: string, contentVersion: string, idempotencyKey: string }) =>
  kb<KbUploadDraft>({ method: 'POST', path: `/materials/uploads/${enc(id)}/confirm`, body }, () => kbDb.confirmUpload(id))

/** POST /materials/uploads/{id}/cancel 取消草稿 */
export const cancelUpload = (id: string, body: { expectedRevision: string, contentVersion: string }) =>
  kb<KbUploadDraft>({ method: 'POST', path: `/materials/uploads/${enc(id)}/cancel`, body }, () => kbDb.cancelUpload(id))

/** GET /materials/uploads/{id}/processing 入库后的解析 / 索引进度 */
export const getUploadProcessing = (id: string) =>
  kb<KbProcessing>({ method: 'GET', path: `/materials/uploads/${enc(id)}/processing` }, () => kbDb.processing(id))

/** POST /materials/uploads/{id}/processing/retry 处理失败后重试 */
export const retryUploadProcessing = (id: string, contentVersion: string) =>
  kb<KbProcessing>({ method: 'POST', path: `/materials/uploads/${enc(id)}/processing/retry`, body: { contentVersion } }, () => kbDb.retryProcessing(id))

/* ---------------- 分享 ---------------- */

/** GET /materials/shares/eligibility/{documentId} 这份材料能否对客分享 */
export const getShareEligibility = (documentId: string) =>
  kb<KbShareEligibility>({ method: 'GET', path: `/materials/shares/eligibility/${enc(documentId)}` }, () => kbDb.shareEligibility(documentId))

/** GET /materials/shares/settings 分享有效期等设置 */
export const getShareSettings = () =>
  kb<KbShareSettings>({ method: 'GET', path: '/materials/shares/settings' }, () => ({ defaultDays: 30, maxDays: 180, linkCopy: true }))

/** POST /materials/shares 创建对客分享链接 */
export const createShare = (body: { documentIds: string[], validDays: number, title: string | null, note: string | null }) =>
  kb<KbShareCreated>({ method: 'POST', path: '/materials/shares', body }, () => kbDb.createShare())

/* ---------------- 问材料 ---------------- */

/** POST /chat/knowledge-base/options 问答可选的知识库 */
export const listChatKnowledgeBases = () =>
  kb<KbLibrary[]>({ method: 'POST', path: '/chat/knowledge-base/options', body: {} }, () => kbDb.libraries())

/** POST /chat/document/options 问答可选的单份材料 */
export const listChatDocuments = () =>
  kb<KbDocumentOption[]>({ method: 'POST', path: '/chat/document/options', body: {} }, () => kbDb.documentOptions())

/** POST /chat/session/list 会话列表（分页参数用字符串） */
export const listSessions = (query: { keyword?: string, pageNo?: number, pageSize?: number } = {}) =>
  kb<KbSessionPage>({
    method: 'POST',
    path: '/chat/session/list',
    body: { keyword: (query.keyword ?? '').trim(), chatMode: 'ALL', turnStatus: 'ALL', pageNo: String(query.pageNo ?? 1), pageSize: String(query.pageSize ?? 50) },
  }, () => kbDb.sessionPage())

/** POST /chat/session/detail 会话详情（含每轮问答和引用） */
export const getSession = (conversationId: string) =>
  kb<KbSessionDetail>({ method: 'POST', path: '/chat/session/detail', body: { conversationId } }, () => kbDb.session(conversationId))

/** POST /chat/session/reset 删除会话（后端为 reset：收口运行中任务并清理记录） */
export const deleteSession = (conversationId: string) =>
  kb<{ success: boolean }>({ method: 'POST', path: '/chat/session/reset', body: { conversationId } }, () => kbDb.deleteSession(conversationId))

/** POST /chat/session/stop 停止生成 */
export const stopSession = (conversationId: string) =>
  kb<{ success: boolean, message?: string }>({ method: 'POST', path: '/chat/session/stop', body: { conversationId } }, () => ({ success: true, message: '已停止生成' }))

/** POST /chat/stream（SSE）流式问答：依次推送 status / thinking / text / reference 事件 */
export function openChatStream(payload: KbStreamPayload, onEvent: (e: KbStreamEvent) => void, signal?: AbortSignal) {
  return stream(
    { method: 'POST', backend: 'kb', path: '/chat/stream', body: payload, signal },
    e => onEvent(e as KbStreamEvent),
    () => mockChatStream(payload),
  )
}

async function* mockChatStream(payload: KbStreamPayload): AsyncGenerator<StreamEvent> {
  const turn = kbDb.planAnswer(payload)
  yield { event: 'status', type: 'status', content: turn.status }
  yield { event: 'thinking', type: 'thinking', content: turn.thinking }
  let answer = ''
  for await (const e of mockTextStream(turn.answer, 'text')) {
    if (e.event !== 'text')
      break
    answer += String(e.answer)
    yield { event: 'text', type: 'text', content: e.answer }
  }
  yield { event: 'reference', type: 'reference', content: turn.references }
  kbDb.commitAnswer(payload, answer, turn.references)
}

/** GET /chat/exchanges/{id}/feedback/submission 我对这轮回答的反馈（没有则为 null） */
export const getMyFeedback = (exchangeId: string) =>
  kb<KbFeedback | null>({ method: 'GET', path: `/chat/exchanges/${enc(exchangeId)}/feedback/submission` }, () => kbDb.myFeedback(exchangeId))

/** PUT /chat/exchanges/{id}/feedback 赞 / 踩 */
export const voteAnswer = (exchangeId: string, rating: KbFeedbackRating) =>
  kb<KbFeedback>({ method: 'PUT', path: `/chat/exchanges/${enc(exchangeId)}/feedback`, body: { rating, uiVariant: 'c', entry: 'panel' } }, () => kbDb.vote(exchangeId, rating))

/** POST /chat/exchanges/{id}/feedback/{feedbackId}/submission 踩之后补充原因 */
export const submitFeedbackReason = (exchangeId: string, feedbackId: string, body: { reasons: KbFeedbackReason[], comment: string | null }) =>
  kb<KbFeedback>({ method: 'POST', path: `/chat/exchanges/${enc(exchangeId)}/feedback/${enc(feedbackId)}/submission`, body }, () => kbDb.feedbackReason(exchangeId, body.reasons))

/** DELETE /chat/exchanges/{id}/feedback/{feedbackId} 撤回反馈 */
export const revokeFeedback = (exchangeId: string, feedbackId: string) =>
  kb<null>({ method: 'DELETE', path: `/chat/exchanges/${enc(exchangeId)}/feedback/${enc(feedbackId)}` }, () => kbDb.revokeFeedback(exchangeId))

// Documented upload/parse/plan/index protocol. Each mutation is invoked once.
export const uploadDocument = (libraryId: string, file: File, usageScope: string) => {
  const form = new FormData()
  form.append('file', file)
  form.append('documentName', file.name)
  form.append('meta', JSON.stringify({ usage_scope: usageScope }))
  return kb<{ documentId: string, taskId: string }>({ method: 'POST', path: `/knowledge-bases/${enc(libraryId)}/documents`, form }, () => { throw new Error('需要真实知识库连接') })
}
export const documentParse = (id: string, taskId: string) => kb<{ parseStatus: string, parseErrorMsg?: string }>({ method: 'GET', path: `/documents/${enc(id)}/parse`, query: { taskId } }, () => ({ parseStatus: '3' }))
type Plan = { planId: string, planVersion: string, parentPipeline: { steps: { stepNo: number, strategyType: string }[] }, childPipeline: { steps: { stepNo: number, strategyType: string }[] }, chunkingContract?: { sourceParseTaskId: string, recommendedProfile: unknown } }
export const documentPlan = (id: string) => kb<{ planReady: boolean, plan: Plan, chunkingContract?: { sourceParseTaskId: string, recommendedProfile: unknown } }>({ method: 'GET', path: `/documents/${enc(id)}/index-plan` }, () => { throw new Error('需要真实连接') })
export const confirmDocumentPlan = (id: string, body: unknown) => kb<{ planId: string }>({ method: 'POST', path: `/documents/${enc(id)}/index-plan/confirm`, body }, () => { throw new Error('需要真实连接') })
export const indexDocument = (id: string, planId: string) => kb<{ taskId: string }>({ method: 'POST', path: `/documents/${enc(id)}/index`, body: { planId } }, () => { throw new Error('需要真实连接') })
export const documentIndex = (id: string, taskId: string) => kb<{ indexStatus: string, errorMessage?: string }>({ method: 'GET', path: `/documents/${enc(id)}/index`, query: { taskId } }, () => ({ indexStatus: '3' }))
