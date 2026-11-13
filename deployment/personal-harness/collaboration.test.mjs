import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCollaboration } from './collaboration.mjs';

const assignment = { memory_scope: 'project', allow_personal_learning: false,
  prompt: '交付方案', shared_outputs: [{ text: '需求' }] };
const binding = { projectHome: '/sandbox/task/home', workspace: '/sandbox/task/work',
  env: { PATH: '/usr/bin' }, approve: async () => ({ outcome: 'rejected' }) };

test('dedicated project scope, explicit environment, closed runtime', async () => {
  let options, closed = false, handler;
  class Fake {
    constructor(value) { options = value; this.client = {
      start: async () => {}, onRequest: fn => { handler = fn; },
    }; }
    async run(input) {
      assert.equal(JSON.parse(input).previous_deliveries[0].text, '需求');
      assert.deepEqual(await handler('approval/request', {}), { outcome: 'rejected' });
      return { finalResponse: '方案', sessionId: 's1', finishReason: 'stop' };
    }
    async close() { closed = true; }
  }
  const result = await executeCollaboration(assignment, binding, Fake);
  assert.equal(result.text, '方案');
  assert.deepEqual(options.env, binding.env);
  assert.equal(options.dshHome, binding.projectHome);
  assert.equal(closed, true);
});

test('failed model output is not a delivery and runtime is reaped', async () => {
  let closed = false;
  class Fake {
    client = { start: async () => {}, onRequest: () => {} };
    async run() { return { finalResponse: 'error detail', finishReason: 'error' }; }
    async close() { closed = true; }
  }
  await assert.rejects(executeCollaboration(assignment, binding, Fake), /delivery_failed/);
  assert.equal(closed, true);
});

test('personal memory scope cannot enter the collaboration runner', async () => {
  await assert.rejects(executeCollaboration({ ...assignment, memory_scope: 'personal' }, binding),
    /invalid_collaboration_scope/);
});
