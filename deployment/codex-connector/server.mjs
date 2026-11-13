import { runAppServer } from './app-server-runner.mjs'
import { startLocalApprovals } from './local-approvals.mjs'
import { startAgentCLI } from './agent-cli-broker.mjs'
import { summarizeSteps } from './steps.mjs'
import { capabilityArgs, capabilityEnvironment, capabilityInstructions, configuredCapabilities } from './capabilities.mjs'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, readdir, lstat, unlink, realpath } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto'

const PORT = Number(process.env.CODEX_CONNECTOR_PORT || 8788)
const TOKEN = process.env.CODEX_CONNECTOR_TOKEN || ''
const CODEX = process.env.CODEX_BIN || 'codex'
const ROOTS = (process.env.CODEX_ALLOWED_ROOTS || process.cwd()).split(path.delimiter).map(x => path.resolve(x))
const DEFAULT_ROOT = path.resolve(process.env.CODEX_WORKDIR || ROOTS[0])
const MAX_BODY = 32 * 1024 * 1024
const MAX_OUTPUT = 32 * 1024 * 1024
const sessionRoots = new Map()
const interactive = process.env.CODEX_CONNECTOR_TRANSPORT === 'app-server'
const approvals = interactive ? await startLocalApprovals() : null
let desktopBusy = false
const SESSION_MAP_FILE = path.join(DEFAULT_ROOT, '.raccoonx', 'codex-connector', 'sessions.json')

async function loadSessionRoots() {
  try {
    const saved = JSON.parse(await readFile(SESSION_MAP_FILE, 'utf8'))
    for (const [sessionId, root] of Object.entries(saved || {})) {
      if (typeof sessionId === 'string' && withinRoots(root)) sessionRoots.set(sessionId, path.resolve(root))
    }
  } catch {}
}

async function persistSessionRoot(sessionId, root) {
  const safeRoot = withinRoots(root)
  if (!sessionId || !safeRoot) return
  sessionRoots.set(sessionId, safeRoot)
  await mkdir(path.dirname(SESSION_MAP_FILE), { recursive: true, mode: 0o700 })
  await writeFile(SESSION_MAP_FILE, JSON.stringify(Object.fromEntries(sessionRoots), null, 2), { mode: 0o600 })
}

function authorized(value) {
  if (!TOKEN) return false
  const actual = Buffer.from(value || '')
  const expected = Buffer.from(`Bearer ${TOKEN}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
}
function withinRoots(candidate) {
  const resolved = path.resolve(candidate || DEFAULT_ROOT)
  return ROOTS.some(root => isWithin(root, resolved)) ? resolved : null
}
async function configuredWorkspace(value) {
  if (!value) return null
  if (!path.isAbsolute(value) || !withinRoots(value)) throw new Error('本机工作区必须是连接器已授权目录内的绝对路径')
  const resolved = await realpath(value).catch(() => { throw new Error('本机工作区不存在，请先在电脑上创建目录') })
  const roots = await Promise.all(ROOTS.map(root => realpath(root)))
  if (!roots.some(root => isWithin(root, resolved)) || !(await lstat(resolved)).isDirectory()) throw new Error('本机工作区超出授权范围或不是目录')
  return resolved
}
async function body(req) {
  let value = ''
  for await (const chunk of req) { value += chunk; if (value.length > MAX_BODY) throw new Error('请求过大') }
  return JSON.parse(value || '{}')
}
async function walk(root, base = root, out = []) {
  for (const name of await readdir(root)) {
    if (name === '.git' || name === 'node_modules' || name === '.raccoonx' || name.startsWith('~$')) continue
    const file = path.join(root, name), info = await lstat(file)
    if (info.isDirectory()) await walk(file, base, out)
    else if (info.isFile() && info.size <= 10 * 1024 * 1024) out.push({ path: path.relative(base, file), size: info.size, mtimeMs: info.mtimeMs })
  }
  return out
}
function finalMessage(events, fallback) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    const text = e?.item?.type === 'agent_message' ? e.item.text : ''
    if (typeof text === 'string' && text.trim() && !/^(thinking|reasoning)$/i.test(text.trim())) return text.trim()
  }
  return fallback.trim()
}
function sessionId(events) {
  const event = events.find(e => e?.type === 'thread.started' || e?.type === 'session.started')
  return event?.thread_id || event?.session_id || event?.id || null
}
async function runCodex(job) {
  const cwd = withinRoots(job.cwd) || DEFAULT_ROOT
  const sessionKey = job.sessionId || createHash('sha256').update(String(job.principal || '') + ':' + (job.projectKey || job.jobId || randomUUID())).digest('hex')
  const work = sessionRoots.get(sessionKey) || await configuredWorkspace(job.config?.workspacePath) || path.join(cwd, '.raccoonx', 'codex-connector', sessionKey)
  await mkdir(work, { recursive: true, mode: 0o700 })
  for (const file of Array.isArray(job.files) ? job.files : []) {
    const name = path.basename(String(file.name || '')).replace(/[\r\n]/g, '')
    if (!name || !/^[\w .()\-\u4e00-\u9fff]+$/.test(name)) continue
    const data = Buffer.from(String(file.data || ''), 'base64')
    if (data.length <= 10 * 1024 * 1024) await writeFile(path.join(work, name), data, { mode: 0o600 })
  }
  const before = new Map((await walk(work)).map(f => [f.path, `${f.size}:${f.mtimeMs}`]))
  const cfg = job.config || {}
  const agentCLI = await startAgentCLI(work, cfg.agentCLI)
  const prompt = `你是${cfg.name || 'Raccoon X 个人助手'}。岗位：${cfg.role || '个人工作助手'}。${cfg.instructions || ''}
自然地回答用户。简单问答直接回答，不展示规划模板；复杂任务先执行、验证，再简洁交付成果。不得把工具协议或内部推理当作回复。
${agentCLI.instructions}
${capabilityInstructions}
用户需求：${job.prompt}
工作目录：${work}
生成文件时说明文件用途和使用方法。`
  const simple = String(job.prompt).length < 120 && !job.files?.length && !/开发|实现|设计|分析|搜索|制作|生成|修复|部署|代码|PPT|文件|build|implement|create/i.test(job.prompt)
  const effort = simple ? 'low' : 'medium'
  const started = Date.now()
  let events = [], answer = ''
  if (interactive) {
    if (desktopBusy) { await agentCLI.close(); throw new Error('本机已有任务正在执行，请等待完成后再试') }
    desktopBusy = true
    try {
      const result = await runAppServer({binary: CODEX, args: capabilityArgs(work), env: capabilityEnvironment({ ...process.env, ...agentCLI.env, NO_COLOR: '1' }), cwd: work, prompt, sessionId: job.sessionId, model: job.model, effort,
        onRequest: request => approvals.request(request, String(job.prompt).slice(0, 500)),
      })
      events = result.events; answer = result.answer
    } finally { desktopBusy = false; approvals.cancelAll(); await agentCLI.close() }
  } else {
  const args = job.sessionId
    // `codex exec resume` accepts the session id and prompt, but does not
    // accept the initial-run `--sandbox`/`--cd` flags. The session retains its
    // original working directory and approval policy.
    ? ['exec', 'resume', job.sessionId, '--json', '--skip-git-repo-check', prompt]
    : ['exec', '--json', '--cd', work, '--sandbox', 'workspace-write', '--skip-git-repo-check', prompt]
  args.splice(args.length - 1, 0, '-c', 'sandbox_mode="workspace-write"')
  args.splice(args.length - 1, 0, ...capabilityArgs(work))
  args.splice(args.length - 1, 0, '-c', `model_reasoning_effort=\"${effort}\"`)
  if (job.model) args.splice(args.length - 1, 0, '--model', job.model)
  const outputFile = path.join(work, `.last-message-${randomUUID()}.txt`)
  await unlink(outputFile).catch(() => {})
  args.splice(args.length - 1, 0, '--output-last-message', outputFile)
  const child = spawn(CODEX, args, { cwd: work, env: capabilityEnvironment({ ...process.env, ...agentCLI.env, NO_COLOR: '1' }), stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  const timer = setTimeout(() => child.kill('SIGTERM'), 300000)
  child.stdout.on('data', b => { if (stdout.length < MAX_OUTPUT) stdout += b.toString() })
  child.stderr.on('data', b => { if (stderr.length < 4000) stderr += b.toString() })
  const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject) }).finally(async () => { clearTimeout(timer); await agentCLI.close() })
  events = stdout.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  answer = ''
  try { answer = await readFile(outputFile, 'utf8') } catch {}
  await unlink(outputFile).catch(() => {})
  answer = answer.trim() || finalMessage(events, '')
  if (code !== 0) {
    // A session id created by the previous cloud Harness is not present in
    // the local Codex store.  Start a fresh local thread transparently so a
    // user can continue the visible Raccoon X conversation after switching
    // executors.
    if (job.sessionId && /session|thread|conversation|rollout/i.test(stderr) && /not found|unknown|不存在|找不到|no such|no rollout|could not find|does not exist|invalid/i.test(stderr)) {
      return runCodex({ ...job, sessionId: undefined, jobId: `${job.jobId || randomUUID()}-fresh` })
    }
    throw new Error(stderr || 'Codex 执行失败')
  }
  }
  const files = await walk(work)
  const artifacts = []
  for (const item of files) {
    if (item.path.startsWith('.') || before.get(item.path) === `${item.size}:${item.mtimeMs}`) continue
    const data = (await readFile(path.join(work, item.path))).toString('base64')
    artifacts.push({ id: `codex:${job.jobId}:${item.path}`, name: path.basename(item.path), size: item.size, data })
  }
  const returnedSession = sessionId(events) || job.sessionId || randomUUID()
  await persistSessionRoot(returnedSession, work)
  return { sessionId: returnedSession, answer: answer || '任务已完成。我已在本地 Codex 工作目录中处理请求，请查看下方交付物。', finishReason: 'stop', duration: Date.now() - started, steps: summarizeSteps(events), artifacts, workspacePath: work }
}
const server = http.createServer(async (req, res) => {
  const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)) }
  if (!authorized(req.headers.authorization)) return reply(401, { error: 'Unauthorized' })
  if (req.method === 'GET' && req.url === '/health') return reply(200, { engine: 'local-codex', version: interactive ? 'app-server-interactive' : 'codex-cli', roots: ROOTS, configuredCapabilities })
  if (req.method !== 'POST' || !['/apply', '/run', '/choose-workspace'].includes(req.url)) return reply(404, { error: 'Not found' })
  try {
    const job = await body(req)
    if (req.url === '/choose-workspace') {
      if (process.platform !== 'darwin') throw new Error('当前连接器尚不支持此系统的文件夹选择器')
      if (server.selectingFolder) throw new Error('已有文件夹选择窗口，请先完成选择')
      server.selectingFolder = true
      try {
        const selected = await new Promise((resolve, reject) => {
          const child = spawn('/usr/bin/osascript', ['-e', 'POSIX path of (choose folder with prompt "选择本机工作区文件夹")'])
          let out = '', err = ''
          const timer = setTimeout(() => child.kill(), 120000)
          child.stdout.on('data', b => { out += b }); child.stderr.on('data', b => { err += b })
          child.on('error', e => { clearTimeout(timer); reject(e) })
          child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(out.trim()); else if (err.includes('-128')) resolve(null); else reject(new Error('文件夹选择未完成，请重试')) })
        })
        return reply(200, selected ? { workspacePath: await configuredWorkspace(selected) } : { cancelled: true })
      } finally { server.selectingFolder = false }
    }
    if (req.url === '/apply') { const workspace = await configuredWorkspace(job.config?.workspacePath); return reply(200, { ready: true, engine: 'local-codex', workspace }) }
    return reply(200, await runCodex(job))
  } catch (error) { return reply(502, { error: String(error.message || '连接器执行失败').slice(0, 400), detail: String(error.message || error).slice(0, 400) }) }
})
await loadSessionRoots()
server.listen(PORT, '127.0.0.1', () => console.log(`Raccoon X local Codex connector listening on 127.0.0.1:${PORT}`))
