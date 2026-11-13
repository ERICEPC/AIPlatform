import { request } from './http'

export type ExternalKnowledgeSet = {
  id: string
  name: string
  provider: 'knowledge_bridge'
  identity_mode: 'caller'
  capability: 'material_qa'
  execution: 'before_answer'
  description: string
  library_ids: string[]
  document_id: string | null
}
export type ExternalKnowledgeOptions = {
  libraries: { id: string, name: string, document_count: string }[]
  documents: { id: string, name: string, library_id: string }[]
}
export type ExternalKnowledgeResult = {
  set_id: string
  name: string
  answer: string
  grounded: boolean
  references: { document_id: string, document_name: string, citation_id: string, section: string, quote: string }[]
}
// No success-shaped mock: connecting a real KB must never silently become demo Q&A.
const unavailable = (): never => { throw new Error('外部知识库需要连接真实服务后使用。') }
export const externalKnowledgeOptions = (signal?: AbortSignal) => request<ExternalKnowledgeOptions>({ method: 'GET', path: '/agent-external-knowledge/options', signal }, unavailable)
export const testExternalKnowledge = (binding: ExternalKnowledgeSet, question: string, signal?: AbortSignal) => request<ExternalKnowledgeResult>({ method: 'POST', path: '/agent-external-knowledge/test', body: { binding, question }, signal }, unavailable)
