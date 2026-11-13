import http from 'node:http'
import { spawn } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
const busy = new Set()
const activeByPrincipal = new Map()
const token = process.env.HARNESS_SERVICE_TOKEN
if (!token) throw new Error('HARNESS_SERVICE_TOKEN required')
function authorized(value) {
  const actual = Buffer.from(value || ''), expected = Buffer.from(`Bearer ${token}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
const server = http.createServer(async (req, res) => {
  const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
  if (!authorized(req.headers.authorization)) return reply(401, { error: 'Unauthorized' })
  if (req.url === '/health') return reply(200, { engine: 'deepseek-harness', version: '0.2.2-rc.1' })
  if (req.method !== 'POST' || !['/apply', '/run', '/history', '/file'].includes(req.url)) return reply(404, { error: 'Not found' })
  let principal, acquired = false
  try {
    let body = ''
    for await (const chunk of req) { body += chunk; if (body.length > 32 * 1024 * 1024) throw new Error('请求过大') }
    const job = JSON.parse(body)
    if (!/^[a-f0-9-]{36}:[a-f0-9-]{36}$/.test(job.principal)) throw new Error('身份无效')
    if (job.projectKey && (typeof job.projectKey !== 'string' || job.projectKey.length > 200)) throw new Error('项目标识无效')
    const basePrincipal = createHash('sha256').update(job.principal + (job.projectKey ? ':project:' + job.projectKey : '')).digest('hex').slice(0, 32)
    const active = activeByPrincipal.get(basePrincipal) || 0
    if (active >= 5) return reply(429, { error: '当前已有 5 条对话在后台运行，请稍后再试' })
    // Different sessions may run in parallel. Messages that carry the same
    // session id remain serialized so a conversation cannot interleave turns.
    const lockKey = job.config?.desktopDeviceId ? basePrincipal : `${basePrincipal}:${job.sessionId || createHash('sha256').update(JSON.stringify({ prompt: job.prompt, files: job.files?.map(f => f.name), at: Date.now() })).digest('hex').slice(0, 16)}`
    if (busy.has(lockKey)) return reply(409, { error: '该对话正在运行，请稍后再试' })
    principal = lockKey
    busy.add(lockKey); activeByPrincipal.set(basePrincipal, active + 1); acquired = true
    const name = `rx-harness-${createHash('sha256').update(lockKey).digest('hex').slice(0, 32)}`
    const args = ['run', '--rm', '-i', '--name', name, '--init', '--user', '1000:1000', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=256', '--memory=2g', '--cpus=2', '--tmpfs', '/tmp:rw,nosuid,exec,size=256m', '--network', process.env.HARNESS_NETWORK, '--mount', `type=volume,source=${job.config?.desktopDeviceId ? `rx-desktop-data-${basePrincipal}` : name},target=/data`, (job.config?.desktopDeviceId ? (process.env.HARNESS_DESKTOP_WORKER_IMAGE || 'raccoon-harness:desktop-0.1.0') : (process.env.HARNESS_WORKER_IMAGE || 'raccoon-harness:0.2.2-rc.1')), 'node', '/app/worker.mjs']
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', outputSize = 0
    child.stdout.on('data', b => { outputSize += b.length; if (outputSize > 30 * 1024 * 1024) child.kill(); else stdout += b })
    child.stderr.on('data', () => {})
    const timer = setTimeout(() => { spawn('docker', ['rm', '-f', name]); child.kill() }, 330000)
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify({ ...job, action: req.url.slice(1) }))
    const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject) })
    clearTimeout(timer)
    const line = stdout.split('\n').findLast(l => l.startsWith('RX_RESULT:'))
    const result = line ? JSON.parse(line.slice(10)) : { error: 'Harness 进程未正常完成' }
    reply(code === 0 && !result.error ? 200 : 502, result)
  } catch { reply(502, { error: 'Harness 服务请求失败' }) }
  finally {
    if (acquired) {
      busy.delete(principal)
      const base = principal?.split(':')[0]
      const count = activeByPrincipal.get(base) || 1
      if (count <= 1) activeByPrincipal.delete(base); else activeByPrincipal.set(base, count - 1)
    }
  }
})
server.listen(8787, '0.0.0.0')
