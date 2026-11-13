import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSuperAgentPrompt, summarizeOrchestration } from './superagent.mjs'

test('super-agent prompt declares plan execute verify deliver phases', () => {
  const result = buildSuperAgentPrompt('做一份客户汇报 PPT', { skills: ['rx-native-pptx'], mcps: [{}] })
  assert.deepEqual(result.phases.map(p => p.id), ['plan', 'execute', 'verify', 'deliver'])
  assert.match(result.prompt, /rx-native-pptx/)
  assert.match(result.prompt, /验证/)
})

test('orchestration summary detects planning and verification tools', () => {
  const summary = summarizeOrchestration([
    { type: 'tool/call', data: { name: 'todo_write' } },
    { type: 'tool/call', data: { name: 'bash' } },
    { type: 'tool/result', data: { message: { isError: false } } },
  ])
  assert.equal(summary.plan_created, true)
  assert.equal(summary.verification_attempted, true)
  assert.equal(summary.tool_calls, 2)
})
