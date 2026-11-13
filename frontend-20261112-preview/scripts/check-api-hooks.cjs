const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// Small hook runner: tests request lifecycle without a browser or new dependencies.
function harness() {
  const slots = []; let cursor = 0; let effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() } }) },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/api/hooks.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(source, { exports, require: name => { assert.equal(name, 'react'); return react }, setInterval, clearInterval })
  return {
    hooks: exports,
    render(fn) { cursor = 0; const result = fn(); const pending = effects; effects = []; pending.forEach(effect => effect()); return result },
    unmount() { slots.forEach(slot => slot.cleanup?.()) },
  }
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
async function main() {
  const query = harness(); const old = deferred(); const next = deferred()
  query.render(() => query.hooks.useQuery(() => old.promise, ['old']))
  query.render(() => query.hooks.useQuery(() => next.promise, ['next']))
  next.resolve('new'); await next.promise
  old.resolve('stale'); await old.promise; await new Promise(setImmediate)
  assert.equal(query.render(() => query.hooks.useQuery(() => next.promise, ['next'])).data, 'new')
  const disabled = deferred()
  query.render(() => query.hooks.useQuery(() => disabled.promise, ['disabled']))
  query.render(() => query.hooks.useQuery(() => disabled.promise, ['disabled'], { enabled: false }))
  disabled.resolve('ignored'); await disabled.promise; await new Promise(setImmediate)
  const state = query.render(() => query.hooks.useQuery(() => disabled.promise, ['disabled'], { enabled: false }))
  assert.equal(state.data, 'new'); assert.equal(state.loading, false)
  query.unmount()

  const mutation = harness()
  const first = mutation.render(() => mutation.hooks.useMutation(async () => 'old'))
  mutation.render(() => mutation.hooks.useMutation(async () => 'latest'))
  assert.equal(await first.run(), 'latest')
  const a = deferred(); const b = deferred(); let count = 0
  const fn = () => (++count === 1 ? a.promise : b.promise)
  const current = mutation.render(() => mutation.hooks.useMutation(fn))
  const pa = current.run(); const pb = current.run()
  a.resolve('a'); await pa
  assert.equal(mutation.render(() => mutation.hooks.useMutation(fn)).pending, true)
  b.resolve('b'); await pb
  assert.equal(mutation.render(() => mutation.hooks.useMutation(fn)).pending, false)
  const failing = mutation.render(() => mutation.hooks.useMutation(async () => { throw new Error('failed') }))
  await assert.rejects(failing.run(), /failed/)
  assert.equal(mutation.render(() => mutation.hooks.useMutation(fn)).pending, false)
  console.log('PASS: stale queries, disabled queries, latest callbacks, concurrent mutations, error recovery')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
