import test from 'node:test'
import assert from 'node:assert/strict'
import { compile, safeSkillPath } from './compiler.mjs'
const config = { name: '独立助手', role: '分析师', instructions: '先给结论', model: { id: 'model-a', baseURL: 'https://example.com/v1', key: 'private-test-key' }, skills: [], mcps: [], memory: '用户偏好' }
test('runtime routes to selected model and never embeds model key in Cordis patch', () => {
  const patch = compile(config)
  assert.equal(patch.find(p => p.id === 'llm-pi-ai').config.providers.platform.models[0].id, 'model-a')
  assert.ok(!JSON.stringify(patch).includes(config.model.key))
  assert.ok(patch.some(p => p.id === 'bash-sandbox' && p.disabled))
})
test('disabled personal memory is excluded, enabled memory is included', () => {
  const prompt = c => compile(c).find(p => p.id === 'system-prompt').config.personaPrefix
  assert.ok(!prompt(config).includes(config.memory))
  assert.ok(prompt({ ...config, memoryEnabled: true }).includes(config.memory))
})
test('skill extraction rejects traversal, absolute paths, and unsafe bundle names', () => {
  for (const file of ['../secret', '/secret', 'x/../../secret', 'x\\secret']) assert.throws(() => safeSkillPath('/data/skills', 'test', file))
  assert.throws(() => safeSkillPath('/data/skills', '../test', 'SKILL.md'))
  assert.equal(safeSkillPath('/data/skills', 'test', 'scripts/run.py'), '/data/skills/test/scripts/run.py')
})
test('selected MCP connectors receive distinct stable namespaces', () => {
  const patch = compile({ ...config, mcps: [{ url: 'https://example.com/mcp' }, { url: 'https://example.org/mcp' }] })
  const entries = patch.find(p => p.insert).insert.filter(p => p.id.startsWith('platform-mcp'))
  assert.deepEqual(entries.map(p => p.config.serverName), ['platform_0', 'platform_1'])
  assert.ok(entries.every(p => p.config.failOnStartupError))
})

 test('desktop bridge carries only task-scoped token and keeps old configuration unchanged', () => {
  const base={model:{id:'demo',baseURL:'https://example.com/v1',key:'cloud-secret'},mcps:[]}
  const patch=compile({...base,desktopBridge:{url:'http://api/bridge',token:'task-token'}})
  const tool=patch.find(p=>p.insert)?.insert.find(p=>p.id==='local-device')
  assert.equal(tool.config.serverName,'local_device')
  assert.equal(JSON.parse(tool.config.env.DESKTOP_BRIDGE).token,'task-token')
  assert.ok(!JSON.stringify(tool).includes('cloud-secret'))
  assert.ok(!compile(base).find(p=>p.insert)?.insert.some(p=>p.id==='local-device'))
})
test('agent management is registered only with account-scoped capability',()=>{
 const patch=compile({...config,agentCLI:{url:'https://10.151.113.125:21190/console/api/personal-assistant/agent-cli',token:'scoped'}})
 const tool=patch.find(p=>p.insert).insert.find(p=>p.id==='agent-manager')
 assert.equal(tool.config.serverName,'agent_manager')
 assert.equal(JSON.parse(tool.config.env.AGENT_MANAGER_CAPABILITY).token,'scoped')
 assert.ok(!compile(config).find(p=>p.insert).insert.some(p=>p.id==='agent-manager'))
 assert.ok(patch.find(p=>p.id==='system-prompt').config.personaPrefix.includes('不要只生成 JSON'))
})
