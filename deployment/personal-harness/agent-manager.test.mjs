import test from 'node:test'
import assert from 'node:assert/strict'
import {tools,invoke} from './agent-manager.mjs'
test('management tools expose supported fields without user or credential overrides',()=>{
 assert.deepEqual(tools.map(t=>t.name),['list','resources','create','get','update','publish','status'])
 for(const t of tools){assert.equal(t.inputSchema.additionalProperties,false);assert.ok(!('token' in t.inputSchema.properties));assert.ok(!('tenant_id' in t.inputSchema.properties))}
 assert.deepEqual(tools.find(t=>t.name==='update').inputSchema.required,['id','revision','patch'])
 assert.ok(tools.find(t=>t.name==='publish').inputSchema.properties.external_access)
})
test('capability cannot redirect credentials to another destination',async()=>{
 for(const url of ['http://10.151.113.125:21190/console/api/personal-assistant/agent-cli','https://example.com/console/api/personal-assistant/agent-cli','https://10.151.113.125:21190/other'])await assert.rejects(invoke({url,token:'test'},'list'),/地址无效/)
 await assert.rejects(invoke({},'delete'),/不支持/)
})
