import type { IChatItem } from '../type'
import { getKnowledgeSources } from './knowledge-source-utils'

export default function KnowledgeSources({ item }: { item: IChatItem }) {
  const sources = getKnowledgeSources(item)
  if (!sources.length) return null
  return (
    <section
      aria-label="知识库检索来源"
      className="mt-3 border-t border-divider-subtle pt-3 text-text-secondary"
    >
      <div className="mb-2 text-xs font-medium">参考文档 · {sources.length}</div>
      {sources.map((source) => (
        <details
          key={JSON.stringify([source.dataset, source.document])}
          className="mb-2 rounded-lg border border-divider-subtle p-2"
        >
          <summary className="cursor-pointer text-sm font-medium break-words text-text-primary focus-visible:outline-2">
            {source.document}
          </summary>
          <div className="mt-2 text-xs text-text-tertiary">
            知识库：{source.dataset} · {source.passages.length} 个检索片段
          </div>
          {source.passages.map((passage) => (
            <blockquote
              key={passage}
              className="mt-2 max-h-64 overflow-auto border-l-2 border-divider-subtle pl-3 text-sm leading-6 break-words whitespace-pre-wrap"
            >
              {passage}
            </blockquote>
          ))}
        </details>
      ))}
      <p className="text-xs text-text-tertiary">
        展示本次检索命中的原文，不代表回答逐字引用了全部内容。
      </p>
    </section>
  )
}
