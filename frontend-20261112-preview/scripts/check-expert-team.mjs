import assert from 'node:assert/strict'
import { createServer } from 'vite'
globalThis.window = {}
const storage = new Map()
globalThis.localStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', environments: { client: { dev: { hot: false } }, ssr: { dev: { hot: false } } } })
try {
 const admin = await server.ssrLoadModule('/src/api/mock/admin.ts')
 const teams = await server.ssrLoadModule('/src/api/mock/teams.ts')
 const collab = await server.ssrLoadModule('/src/api/mock/collab.ts')
 const access = await server.ssrLoadModule('/src/api/mock/access.ts')
 const directory = collab.listMembers().data
 assert.ok(directory.length >= 5)
 assert.ok(directory.every(m => m.kind === 'assistant' && m.avatar && m.role))
 const demoGroup = collab.createGroup({ name: '同事助手验证群', assistant_ids: ['yy', 'zw'], agent_ids: [] })
 assert.ok(['yy', 'zw'].every(id => demoGroup.members.some(m => m.id === id)))
 collab.sendMessage(demoGroup.id, { content: '@叶源的助手 请整理方案' })
 assert.ok(collab.listMessages(demoGroup.id).data.length > 0)
 console.log('PASS: colleague directory, group creation and mentions')
 const group = collab.listGroups().data.find(g => g.id !== demoGroup.id && g.kind !== 'direct' && g.members.length >= 2 && g.members.length <= 9)
 const roster = teams.listing().agents.slice(0, group.members.length)
 const count = teams.listing().teams.length
 const body = { scope: 'FDE 交付中心', member_mapping: group.members.map((m,i) => ({source: m.id, agent_id: roster[i].id})), config: { name: '验证专家团', goal: '检查审批后落地', output: '报告', leader_id: roster[0].id, members: roster.slice(1).map(a => ({agent_id:a.id,responsibility:'分析与复核', input_hint:''})), parallelism:2,max_calls:4,max_rounds:2,timeout:120 } }
 access.signIn('dev')
 const r = admin.submitExpertTeam(group.id, body)
 assert.equal(teams.listing().teams.length,count)
 assert.throws(() => admin.submitExpertTeam(group.id,body))
 assert.throws(() => admin.decide(r.id,{decision:'approve',comment:''}))
 access.signIn('admin')
 assert.throws(() => admin.decide(r.id,{decision:'approve',comment:''}))
 access.signIn('super')
 admin.decide(r.id,{decision:'return',comment:'补充产出'})
 assert.equal(teams.listing().teams.length,count)
 access.signIn('dev')
 const next = admin.submitExpertTeam(group.id,body)
 body.config.name='不得改变审批快照'
 access.signIn('super')
 admin.decide(next.id,{decision:'approve',comment:'通过'})
 assert.equal(teams.listing().teams.length,count+1)
 const team = teams.detail(next.object_id).team
 assert.equal(team.name,'验证专家团')
 assert.ok(team.published_id)
 assert.throws(() => admin.decide(next.id,{decision:'approve',comment:''}))
 assert.equal(teams.listing().teams.length,count+1)
 const agentDb = (await server.ssrLoadModule('/src/api/mock/agents.ts')).db
 const skillDb = (await server.ssrLoadModule('/src/api/mock/skills.ts')).db
 const kbDb = (await server.ssrLoadModule('/src/api/mock/knowledge.ts')).kbDb
 const toolDb = (await server.ssrLoadModule('/src/api/mock/integrations/tools.ts')).toolDb
 const seeds = (await server.ssrLoadModule('/src/api/mock/development-seeds.ts')).developmentSeeds
 for (const seed of seeds) {
  const item = seed.kind === 'agent' ? agentDb.detail(seed.id) : seed.kind === 'team' ? teams.detail(seed.id).team : seed.kind === 'knowledge' ? kbDb.libraries().find(k => k.id === seed.id) : seed.kind === 'skill' ? skillDb.getLocal(seed.id) : toolDb.mcpList().find(m => m.id === seed.id)
  assert.ok(item, seed.id)
 }
 access.signIn('super')
 assert.equal(admin.myReleases().data.filter(r => r.id.startsWith('RQ-DEMO-')).length,15)
 console.log('PASS: 20 demo resources have valid details and 15 matching release records')
 assert.throws(() => admin.submitResourceShare({resource_kind:'agent',object_id:'demo-agent-1',name:'草稿',reason:'验证草稿限制',scope:'FDE 交付中心'}), /草稿不能共享/)
 const sharing = await server.ssrLoadModule('/src/api/resource-sharing.ts')
 for (const kind of ['agent','team','knowledge','skill','mcp']) {
  access.signIn('dev')
  const body = { resource_kind: kind, object_id: ({ agent: 'agt-meeting', team: 'weekly', knowledge: kbDb.personalLibraries()[0].id, skill: skillDb.listLocal().data.find(s => s.installed_by === '叶源').id, mcp: toolDb.mcpList().find(m => m.author === '叶源').id }[kind]), name: `共享${kind}`, reason: '可复用的成果', scope: 'FDE 交付中心' }
  if (kind === 'team') { assert.throws(() => admin.submitResourceShare(body), /草稿不能共享/); teams.publish(body.object_id, teams.detail(body.object_id).team.revision) }
  const first = admin.submitResourceShare(body)
  assert.equal(sharing.resourceShareState(admin.resourceShares().data,kind,body.object_id).state,'pending')
  assert.throws(() => admin.submitResourceShare(body))
  access.signIn('super')
  admin.decide(first.id,{decision:'return',comment:'补充说明'})
  access.signIn('dev')
  const again = admin.submitResourceShare(body)
  access.signIn('super')
  admin.decide(again.id,{decision:'approve',comment:'同意共享'})
  assert.equal(sharing.resourceShareState(admin.resourceShares().data,kind,body.object_id).state,'approved')
  assert.throws(() => admin.submitResourceShare(body))
 }
 console.log('PASS: shared state is consistent across five resource types; draft agents/teams cannot submit; published resources support approval')
 console.log('PASS: pending isolation, duplicate prevention, permission scopes, return/resubmit, immutable snapshot, approval creates exactly one published team')
} finally { await server.close() }
