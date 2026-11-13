import type { ModelFeature, ModelType } from '@/api/integrations'

export const modelTypeLabel: Record<ModelType, string> = {
  'llm': 'LLM',
  'text-embedding': 'TEXT EMBEDDING',
  'rerank': 'RERANK',
  'speech2text': 'SPEECH2TEXT',
  'tts': 'TTS',
  'moderation': 'MODERATION',
}

export const modelTypeName: Record<ModelType, string> = {
  'llm': '对话模型',
  'text-embedding': 'Embedding',
  'rerank': 'Rerank',
  'speech2text': '语音转文本',
  'tts': '文本转语音',
  'moderation': '内容审查',
}

export const featureLabel: Record<ModelFeature, string> = {
  'tool-call': '工具调用',
  'multi-tool-call': '多工具调用',
  'stream-tool-call': '流式工具调用',
  'agent-thought': '推理',
  'vision': '视觉',
  'video': '视频',
  'document': '文档',
  'audio': '音频',
  'structured-output': '结构化输出',
}

export const fmtContext = (n?: number) => (!n ? '' : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
