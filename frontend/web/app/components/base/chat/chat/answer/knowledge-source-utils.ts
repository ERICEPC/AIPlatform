import type { IChatItem, ThoughtItem } from '../type'

export type KnowledgeSource = { document: string; dataset: string; passages: string[] }

export function knowledgeOutputs(thoughts: ThoughtItem[]): string[] {
  return thoughts.flatMap((thought) => {
    let names: unknown = thought.tool
    let outputs: unknown = thought.observation
    try {
      names = JSON.parse(thought.tool)
    } catch {}
    if (Array.isArray(names)) {
      try {
        outputs = JSON.parse(thought.observation)
      } catch {
        return []
      }
      if (!Array.isArray(outputs)) return []
      const values = outputs
      return names.flatMap((name, index) =>
        name === 'knowledge_base_search' && typeof values[index] === 'string'
          ? [values[index]]
          : [],
      )
    }
    return names === 'knowledge_base_search' && typeof outputs === 'string' ? [outputs] : []
  })
}

export function getKnowledgeSources(item: IChatItem): KnowledgeSource[] {
  const thoughts = [
    ...(item.agent_thoughts ?? []),
    ...(item.agent_response_parts
      ?.filter((part) => part.type === 'thought')
      .map((part) => part.thought) ?? []),
  ]
  const outputs = [...(item.knowledge_retrieval ?? []), ...knowledgeOutputs(thoughts)]
  const groups = new Map<string, KnowledgeSource>()
  for (const output of outputs) {
    if (!output.trimStart().startsWith('Knowledge base search results:')) continue
    const lines = output.split('\n')
    const headers: number[] = []
    for (let index = 0; index < lines.length; index++) {
      if (
        /^\d+\. Title: /.test((lines[index] ?? '').trim()) &&
        lines[index + 1]?.trim().startsWith('Dataset: ') &&
        lines[index + 2]?.trim().startsWith('Document: ') &&
        lines[index + 3]?.trim().startsWith('Score: ') &&
        lines[index + 4]?.trim().startsWith('Content: ')
      )
        headers.push(index)
    }
    for (const [index, start] of headers.entries()) {
      const dataset = (lines[start + 1] ?? '').trim().slice('Dataset: '.length)
      const document = (lines[start + 2] ?? '').trim().slice('Document: '.length)
      const passage = [
        (lines[start + 4] ?? '').trim().slice('Content: '.length),
        ...lines.slice(start + 5, headers[index + 1] ?? lines.length),
      ]
        .join('\n')
        .trim()
      if (!document || !passage) continue
      const key = JSON.stringify([dataset, document])
      const source = groups.get(key) ?? { document, dataset, passages: [] }
      if (!source.passages.includes(passage)) source.passages.push(passage)
      groups.set(key, source)
    }
  }
  return [...groups.values()]
}
