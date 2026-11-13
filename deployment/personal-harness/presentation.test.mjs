import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import { zstdCompressSync } from 'node:zlib'
import { executionSteps, workspaceFiles, snapshotArtifacts, readArtifact, readLegacyHistory } from './presentation.mjs'
test('execution marks only matched successful tool results as done', () => {
  const events = [{ type: 'tool/call', time: 1000, data: { callId: '1', name: 'write' } }, { type: 'tool/result', time: 2100, data: { message: { toolCallId: '1', isError: false } } }, { type: 'tool/call', time: 2200, data: { callId: '2', name: 'read' } }]
  assert.deepEqual(executionSteps(events).map(s => [s.status, s.duration]), [['done', 1100], ['unknown', null]])
})
test('artifacts are immutable copies; symlinks and traversal cannot be downloaded', async () => {
  const root = await mkdtemp(`${os.tmpdir()}/rx-presentation-`)
  try {
    await mkdir(`${root}/workspace`)
    await writeFile(`${root}/private`, 'private')
    await symlink(`${root}/private`, `${root}/workspace/leak`)
    await writeFile(`${root}/workspace/report.md`, 'original')
    const files = await workspaceFiles(`${root}/workspace`)
    assert.equal(files.length, 1)
    const [artifact] = await snapshotArtifacts(root, [], files)
    assert.equal(artifact.cloud_saved,true)
    assert.equal(Buffer.from(artifact.data,'base64').toString(),'original')
    await writeFile(`${root}/workspace/report.md`, 'changed')
    assert.equal(Buffer.from((await readArtifact(root, artifact.id)).data, 'base64').toString(), 'original')
    await assert.rejects(readArtifact(root, '../private'))
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('legacy compressed history restores visible text and excludes reasoning', async () => {
  const root = await mkdtemp(`${os.tmpdir()}/rx-history-`)
  try {
    const dir = `${root}/home/sessions/project/session-example`
    await mkdir(dir, { recursive: true })
    const events = [{ type: 'user/message', data: { content: [{ type: 'text', text: 'hello' }] } }, { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'private reasoning' }, { type: 'text', text: 'hi' }] } } }]
    await writeFile(`${dir}/session.v4.jsonl.zstd`, zstdCompressSync(Buffer.from(events.map(e => JSON.stringify(e)).join('\n'))))
    const { turns } = await readLegacyHistory(root, 'session-example')
    assert.equal(turns[0].q, 'hello'); assert.equal(turns[0].a, 'hi\n')
    await assert.rejects(readLegacyHistory(root, '../example'))
  } finally { await rm(root, { recursive: true, force: true }) }
})
