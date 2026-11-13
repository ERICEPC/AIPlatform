import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { executionSteps, workspaceFiles, snapshotArtifacts, readArtifact, readLegacyHistory } from './presentation.mjs'
import { compile, safeSkillPath } from './compiler.mjs'
import { buildSuperAgentPrompt, summarizeOrchestration, SUPER_AGENT_VERSION } from './superagent.mjs'
let input = ''
for await (const chunk of process.stdin) input += chunk
const job = JSON.parse(input)

function textFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(item => typeof item === 'string' ? item : item?.text || item?.content?.text || '').filter(Boolean).join('\n')
}

function cleanAssistantText(value) {
  if (typeof value !== 'string') return ''
  // The model/runtime may expose an internal DSML tool-call block as the
  // assistant message. Never show that protocol to end users.
  const withoutDsml = value.replace(/<\|DSML\|>[\s\S]*?(?=<\|DSML\|>|$)/g, '').replace(/<\|[^>]+\|>/g, '')
  if (/\|\s*DSML\s*\|/i.test(withoutDsml) || /invoke\s+name=/i.test(withoutDsml)) return ''
  if (/^\s*(the user says|the assistant says|用户说|助手说)\b/i.test(withoutDsml)) return ''
  // Super-Agent planning is an internal trace. Older model routes may still
  // echo it despite the prompt contract; never expose it as the final answer.
  if (/^\s*(阶段\s*[1一二三四四]?[：:.]|阶段\s*[1-4]\s*[·.]|规划阶段|执行阶段|验证阶段|交付阶段)/i.test(withoutDsml)) {
    // Some model routes return the internal plan and the user-facing answer
    // in one message. Keep only the delivery section when it exists.
    const marker = withoutDsml.match(/(?:最终回复|交付结果|交付说明|结果如下)[：:\s]*/)
    if (marker) return withoutDsml.slice((marker.index || 0) + marker[0].length).trim()
    return ''
  }
  if (/(目标：|输入：.*未提供|最小可行步骤|暂无动作可执行|内部执行记录|工具调用记录)/.test(withoutDsml)) {
    const marker = withoutDsml.match(/(?:最终回复|交付结果|交付说明)[：:\s]*/)
    if (marker) return withoutDsml.slice((marker.index || 0) + marker[0].length).trim()
    return ''
  }
  return withoutDsml.trim()
}

function finalText(run) {
  if (typeof run?.finalResponse === 'string' && cleanAssistantText(run.finalResponse)) return cleanAssistantText(run.finalResponse)
  const events = Array.isArray(run?.events) ? run.events : []
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (!String(event?.type || '').includes('assistant')) continue
    const message = event?.data?.message || event?.message || event?.data
    const text = textFromContent(message?.content ?? event?.content)
    if (cleanAssistantText(text)) return cleanAssistantText(text)
  }
  return ''
}
const root = process.env.HARNESS_DATA || '/data'
let harness
if (job.action === 'history' || job.action === 'file') {
  try {
    const result = job.action === 'history' ? await readLegacyHistory(root, job.sessionId) : await readArtifact(root, job.fileId)
    process.stdout.write('RX_RESULT:' + JSON.stringify(result) + '\n')
  } catch { process.stdout.write('RX_RESULT:' + JSON.stringify({ error: '历史记录或文件不可用' }) + '\n'); process.exitCode = 1 }
} else try {
  await mkdir(`${root}/workspace`, { recursive: true })
  await mkdir(`${root}/home`, { recursive: true })
  await rm(`${root}/skills`, { recursive: true, force: true })
  await mkdir(`${root}/skills`, { recursive: true })
  for (const file of job.files || []) {
    const name = path.basename(String(file.name || '')).replace(/[\r\n]/g, '')
    if (!name || name === '.' || name === '..' || !/^[\w .()\-\u4e00-\u9fff]+$/.test(name)) continue
    const data = Buffer.from(String(file.data || ''), 'base64')
    if (data.length > 10 * 1024 * 1024) continue
    await writeFile(path.join(`${root}/workspace`, name), data, { mode: 0o600 })
  }
  for (const skill of job.config.skills || []) {
    for (const file of skill.files) {
      const dest = safeSkillPath(`${root}/skills`, skill.name, file.path)
      await mkdir(path.dirname(dest), { recursive: true })
      await writeFile(dest, Buffer.from(file.data, 'base64'), { mode: 0o600 })
    }
  }
  await rm(`${root}/readiness.json`, { force: true })
  const patch = `${root}/runtime.patch.yml`
  await writeFile(patch, JSON.stringify(compile(job.config, root)), { mode: 0o600 })
  harness = new DeepSeekHarness({
    profile: 'sdk', dshHome: `${root}/home`, cwd: `${root}/workspace`, processCwd: `${root}/workspace`,
    patches: [patch], provider: 'platform', model: job.config.model.id,
    maxTokens: job.config.maxTokens || 4096, initializeTimeoutMs: 90000, requestTimeoutMs: 300000,
    approvalRequests: true,
    env: { PATH: process.env.PATH, HOME: root, PLATFORM_MODEL_KEY: job.config.model.key, DSH_PERMISSION_MODE: 'workspace-write' },
  })
  harness.client.start()
  // The worker runs inside a read-only, per-user container with only the
  // workspace volume mounted.  When the owner has enabled execution, approve
  // requests for that isolated workspace so Skills can actually create files,
  // run tests and package deliverables.  Keep the product-level switch as the
  // authority: disabled assistants remain text-only.
  harness.client.onRequest(async () => ({ outcome: job.config.executionEnabled ? 'allowed-once' : 'rejected' }))
  await harness.start()
  let inventory
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    try { inventory = JSON.parse(await readFile(`${root}/readiness.json`, 'utf8')) } catch {}
    const skillsReady = (job.config.skills || []).every(s => inventory?.skills?.includes(s.name))
    const mcpReady = (job.config.mcps || []).every((m, i) => inventory?.tools?.some(t => t.startsWith(`mcp__platform_${i}__`)))
    const bridgeReady = (!job.config.bridge || inventory?.tools?.some(t => t.startsWith('mcp__raccoon__'))) && (!job.config.agentCLI || inventory?.tools?.some(t => t.startsWith('mcp__agent_manager__')))
    if (inventory && skillsReady && mcpReady && bridgeReady) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!inventory || !(job.config.skills || []).every(s => inventory.skills.includes(s.name)) || !(job.config.mcps || []).every((m, i) => inventory.tools.some(t => t.startsWith(`mcp__platform_${i}__`))) || (job.config.bridge && !inventory.tools.some(t => t.startsWith('mcp__raccoon__')))) throw new Error('Selected resources did not register')
  if(job.config.agentCLI && !inventory.tools.some(t=>t.startsWith('mcp__agent_manager__'))) throw new Error('Agent manager did not register')
  let result = { inventory, ready: true, engine: 'deepseek-harness', version: '0.2.2-rc.1' }
  if (job.action === 'run') {
    if (job.sessionId) {
      try { await harness.resumeSession(job.sessionId) }
      catch (error) {
        // A session created before a worker image/volume rotation may no
        // longer exist in the isolated runtime. Start a fresh turn instead
        // of returning a generic Harness 502 to the user.
        if (!/session .* not found/i.test(String(error))) throw error
      }
    }
    const before = await workspaceFiles(`${root}/workspace`)
    const started = Date.now()
    const orchestration = buildSuperAgentPrompt(job.prompt, job.config)
    const run = await harness.run(orchestration.prompt, job.sessionId ? { sessionId: job.sessionId } : {})
    const after = await workspaceFiles(`${root}/workspace`)
    let answer = finalText(run)
    const steps = executionSteps(run.events)
    const artifacts = await snapshotArtifacts(root, before, after)
    if (!answer && artifacts.length) answer = `任务已完成，我已经生成了 ${artifacts.length} 个文件。你可以在下方下载；如果需要我继续修改，直接告诉我文件名和修改内容即可。`
    if (!answer) answer = run.finishReason === 'error' ? '任务执行未完成，请查看执行过程中的错误信息后重试。' : '任务已经执行，但模型没有返回面向用户的说明。请查看执行过程中的产物，或让我继续整理结果。'
    if (!answer && !steps.some(step => step.status === 'error')) steps.push({ label: run.finishReason === 'error' ? '模型执行失败' : '模型未返回文本', status: 'error' })
    result = { ...result, sessionId: run.sessionId, answer, finishReason: run.finishReason, duration: Date.now() - started, steps, artifacts, orchestration: { version: SUPER_AGENT_VERSION, phases: orchestration.phases, summary: summarizeOrchestration(run.events) } }
  }
  process.stdout.write('\nRX_RESULT:' + JSON.stringify(result) + '\n')
} catch (error) {
  let diagnostic = String(error?.stack || error)
  for (const secret of [job.config.model?.key, job.config.bridge?.token, job.config.agentCLI?.token, ...(job.config.mcps || []).flatMap(m => Object.values(m.headers || {}))].filter(Boolean)) diagnostic = diagnostic.replaceAll(secret, '[REDACTED]')
  await writeFile(`${root}/last-error.log`, diagnostic, { mode: 0o600 }).catch(() => {})
  // Do not return runtime stderr: it may contain credentials or upstream response bodies.
  process.stdout.write('\nRX_RESULT:' + JSON.stringify({ error: 'Harness 启动或运行失败，请检查模型路由与所选连接器', kind: error?.name || 'Error' }) + '\n')
  process.exitCode = 1
} finally {
  if (harness) await harness.close().catch(() => {})
  await rm(`${root}/runtime.patch.yml`, { force: true })
}
