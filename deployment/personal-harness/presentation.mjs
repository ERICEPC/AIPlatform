import { readdir, stat, realpath, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
export function executionSteps(events = []) {
  return events.filter(e => e.type === 'tool/call').map(e => {
    const result = events.find(r => r.type === 'tool/result' && (r.data?.message?.toolCallId || r.data?.message?.callId) === e.data.callId)
    const labels = { read: '读取文件', write: '写入文件', edit: '编辑文件', skill: '读取 Skill', bash: '执行工作区命令', web_search: '搜索资料', web_fetch: '读取网页', todo_write: '更新任务计划' }
    return { label: labels[e.data.name] || `调用工具 ${e.data.name}`, status: result ? result.data.message.isError ? 'error' : 'done' : 'unknown', duration: result ? Math.max(0, result.time - e.time) : null }
  }).slice(0, 100)
}
export async function workspaceFiles(root) {
  const output = []
  async function walk(dir, depth = 0) {
    if (depth > 6 || output.length >= 200) return
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.isSymbolicLink()) continue
      const file = path.join(dir, e.name)
      if (e.isDirectory()) await walk(file, depth + 1)
      else if (e.isFile()) { const info = await stat(file); output.push({ path: path.relative(root, file), name: e.name, size: info.size, mtime: info.mtimeMs }) }
    }
  }
  await walk(root)
  return output
}
export async function snapshotArtifacts(root, before, after) {
  const changed = after.filter(f => f.size <= 20 * 1024 * 1024 && !before.some(b => b.path === f.path && b.mtime === f.mtime && b.size === f.size))
  await mkdir(`${root}/artifacts`, { recursive: true })
  const result = []
  const workspace = await realpath(`${root}/workspace`)
  let transferred = 0
  for (const file of changed.slice(0, 20)) {
    const source = await realpath(path.join(root, 'workspace', file.path))
    if (!source.startsWith(`${workspace}/`)) continue
    const data = await readFile(source)
    const id = createHash('sha256').update(data).digest('hex')
    await writeFile(`${root}/artifacts/${id}`, data, { mode: 0o600 })
    transferred += data.length
    result.push({ id, name: file.name, size: data.length, ...(transferred <= 20 * 1024 * 1024 ? {data:data.toString('base64'),cloud_saved:true} : {cloud_saved:false,sync_error:'本轮文件总量超过 20 MB，云端附件未同步，请拆分交付。'}) })
  }
  return result
}
export async function readArtifact(root, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('文件标识无效')
  const file = `${root}/artifacts/${id}`
  if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error('文件过大')
  return { data: (await readFile(file)).toString('base64') }
}
export async function readLegacyHistory(root, sessionId) {
  if (!/^session-[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('会话标识无效')
  const candidates = []
  async function walk(dir, depth = 0) {
    if (depth > 6) return
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(dir, e.name)
      if (e.isDirectory()) await walk(file, depth + 1)
      else if (e.isFile() && file.includes(sessionId) && (e.name.endsWith('.jsonl') || e.name.endsWith('.jsonl.zstd'))) candidates.push(file)
    }
  }
  await walk(`${root}/home/sessions`)
  const turns = []
  for (const file of candidates.sort().slice(-1)) {
    if ((await stat(file)).size > 32 * 1024 * 1024) throw new Error('历史记录过大')
    const bytes = await readFile(file)
    const content = file.endsWith('.zstd') ? zstdDecompressSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }).toString('utf8') : bytes.toString('utf8')
    for (const line of content.split('\n')) {
      let event; try { event = JSON.parse(line) } catch { continue }
      const blocks = event.data?.message?.content || event.data?.content || []
      const text = Array.isArray(blocks) ? blocks.filter(b => b.type === 'text').map(b => b.text).join('\n') : ''
      if (event.type === 'user/message' && (!event.data?.source?.kind || event.data.source.kind === 'user') && text) turns.push({ q: text, a: '', steps: [], artifacts: [] })
      if (event.type === 'assistant/message' && text && turns.length) turns[turns.length - 1].a += text + '\n'
    }
  }
  return { turns }
}
