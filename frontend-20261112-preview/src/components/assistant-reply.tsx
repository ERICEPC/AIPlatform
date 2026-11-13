import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './assistant-reply.css'

type ArtifactLink = { id: string; name: string }
const isLocal = (url: string) => /^(?:\/|file:|sandbox:|[A-Za-z]:[\\/])/.test(url)
const fileName = (url: string) => {
  try { return decodeURIComponent(url).split(/[\\/]/).pop()?.split(/[?#]/)[0] || '' }
  catch { return '' }
}

export function AssistantReply({ text, artifacts = [], onPreview, inlineReferences = {} }: {
  text: string
  inlineReferences?: Record<string, ReactNode>
  artifacts?: ArtifactLink[]
  onPreview: (id: string, name: string) => void
}) {
  return <div className="assistant-reply">
    <ReactMarkdown remarkPlugins={[remarkGfm]}
      urlTransform={url => /^(https?:|mailto:)/i.test(url) || isLocal(url) || url.startsWith('#') || (!!url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) ? url : ''}
      components={{
        table: ({ children }) => <div className="reply-table-scroll" tabIndex={0} role="region" aria-label="回答中的表格"><table>{children}</table></div>,
        a: ({ href = '', children }) => {
          if (Object.prototype.hasOwnProperty.call(inlineReferences, href)) return <>{inlineReferences[href]}</>
          if (isLocal(href) || (!!href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#'))) {
            const name = fileName(href)
            const matches = artifacts.filter(file => file.name === name)
            return matches.length === 1
              ? <button className="reply-file-link" onClick={() => onPreview(matches[0].id, matches[0].name)}>↗ {children} · {name}</button>
              : <span className="reply-file-reference">{children}（{name || '文件'}，暂无可预览附件）</span>
          }
          return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>
        },
        img: ({ src = '', alt }) => {
          const matches = artifacts.filter(file => file.name === fileName(src))
          return matches.length === 1
            ? <button className="reply-file-link" onClick={() => onPreview(matches[0].id, matches[0].name)}>查看图片 · {alt || matches[0].name}</button>
            : <span className="reply-file-reference">{alt || '图片引用'}</span>
        },
      }}>{text}</ReactMarkdown>
  </div>
}
