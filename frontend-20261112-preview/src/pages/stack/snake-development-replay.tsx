import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

const engine = `export const GRID = 20;
export function move(snake, direction, food) {
  const head = { x: snake[0].x + direction.x,
                 y: snake[0].y + direction.y };
  const eating = head.x === food.x && head.y === food.y;
  const body = snake;
  const collision = head.x < 0 || head.y < 0 ||
    head.x >= GRID || head.y >= GRID ||
    body.some(p => p.x === head.x && p.y === head.y);
  if (collision) return { snake, status: 'game-over' };
  return { snake: [head, ...snake.slice(0, eating ? undefined : -1)],
           scoreDelta: eating ? 10 : 0, status: 'running' };
}`
const fixed = engine.replace('const body = snake;', 'const body = eating ? snake : snake.slice(0, -1);')
const controls = `const directions = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }
};
export function nextDirection(current, key) {
  const next = directions[key];
  if (!next || (next.x === -current.x && next.y === -current.y)) {
    return current; // 禁止直接反向移动
  }
  return next;
}`
const tests = `import { describe, it, expect } from 'vitest';
import { move } from '../src/game/engine';

describe('snake movement', () => {
  it('allows moving into the departing tail cell', () => {
    const snake = [{x:1,y:1}, {x:1,y:2}, {x:0,y:2}, {x:0,y:1}];
    const result = move(snake, {x:-1,y:0}, {x:9,y:9});
    expect(result.status).toBe('running');
  });
  it('adds 10 points when eating food', () => {
    const result = move([{x:1,y:1}], {x:1,y:0}, {x:2,y:1});
    expect(result.scoreDelta).toBe(10);
    expect(result.snake).toHaveLength(2);
  });
});`
const initial = {'package.json':'{\n  "name": "snake-game",\n  "scripts": { "test": "vitest run", "build": "vite build" },\n  "devDependencies": { "vite": "^6.0.0", "vitest": "^3.0.0" }\n}'}
type Step = { title:string; file:string; code:string; command:string; output:string[]; result:string; failed?:boolean; tests?:{name:string;pass:boolean}[] }
const checks = ['边界碰撞结束游戏','食物计分与身体增长','禁止反向移动','进入正在离开的尾格']
export const steps:Step[] = [
 {title:'初始化项目',file:'package.json',code:initial['package.json'],command:'npm install',output:['added 84 packages in 2.1s','项目依赖已准备，开始实现游戏逻辑。'],result:'依赖准备完成'},
 {title:'实现移动与碰撞',file:'src/game/engine.js',code:engine,command:'git diff --stat',output:['src/game/engine.js | 13 +++++++++++++','新增移动、边界碰撞与计分逻辑。'],result:'新增游戏引擎'},
 {title:'接入方向控制',file:'src/game/controls.js',code:controls,command:'git diff --stat',output:['src/game/controls.js | 11 +++++++++++','加入方向键映射与反向输入保护。'],result:'新增输入模块'},
 {title:'执行边界测试',file:'tests/engine.test.js',code:tests,command:'npm test',output:['RUN v3.0.0 /workspace/snake-game','✓ 边界碰撞结束游戏','✓ 食物计分与身体增长','✓ 禁止反向移动','× 进入正在离开的尾格','AssertionError: expected game-over to be running','Tests  1 failed | 3 passed (4)'],result:'发现尾格碰撞问题',failed:true,tests:checks.map((name,i)=>({name,pass:i!==3}))},
 {title:'修复碰撞边界',file:'src/game/engine.js',code:fixed,command:'git diff -- src/game/engine.js',output:['- const body = snake;','+ const body = eating ? snake : snake.slice(0, -1);','非进食移动时排除即将离开的尾格。'],result:'已修复误判'},
 {title:'回归测试通过',file:'tests/engine.test.js',code:tests,command:'npm test',output:['RUN v3.0.0 /workspace/snake-game','✓ tests/engine.test.js (3 tests)','✓ tests/controls.test.js (1 test)','Test Files  2 passed (2)','Tests       4 passed (4)','Duration    324ms'],result:'4 / 4 测试通过',tests:checks.map(name=>({name,pass:true}))},
 {title:'构建与产物检查',file:'src/game/engine.js',code:fixed,command:'npm run build',output:['vite v6.0.0 building for production...','✓ 8 modules transformed.','dist/index.html               0.51 kB','dist/assets/index-snake.js    4.82 kB','✓ built in 218ms','产物就绪，可在界面预览中体验贪吃蛇。'],result:'构建成功'},
]
export type ReplayControl = { index:number; playing:boolean; blocked:boolean; onAction:(action:'play'|'pause'|'reset'|'step'|'seek',target?:number)=>void }
export function SnakeDevelopmentReplay({execution,branch,replay}:{execution:boolean;branch:string;replay:ReplayControl}) {
 const {index,playing,blocked,onAction}=replay
 const [selected,setSelected]=useState('package.json'),[diff,setDiff]=useState(true)
 useEffect(()=>setSelected(steps[index].file),[index])
 const current=steps[index],files:Record<string,string>={}
 steps.slice(0,index+1).forEach(s=>{files[s.file]=s.code})
 const path=files[selected]===undefined?current.file:selected
 const previous=steps.slice(0,index).filter(s=>s.file===path).at(-1)?.code||''
 const code=files[path]||'',oldLines=previous.split('\n'),newLines=code.split('\n')
 const changed = code!==previous
 const display=diff&&changed ? (previous?oldLines.flatMap((line,i)=>line===newLines[i]?[{text:line,kind:'same'}]:[{text:line,kind:'remove'},{text:newLines[i]||'',kind:'add'}]):newLines.map(text=>({text,kind:'add'}))) :newLines.map(text=>({text,kind:'same'}))
 const testResult=steps.slice(0,index+1).filter(s=>s.tests).at(-1)
 return <div className="flex min-h-0 flex-1 flex-col">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/50 px-4 py-3"><div><span className="text-xs font-semibold">贪吃蛇 · 开发记录</span><span className="ml-2 rounded bg-volt-soft px-1.5 py-0.5 text-[10px] text-volt-text">示例数据</span><p className="mt-1 text-[10px] text-ink-3">代码、命令和测试按步骤联动 · 不执行真实命令</p></div><div className="flex gap-1"><Button size="small" variant="primary" disabled={blocked||index===steps.length-1} onClick={()=>{onAction(playing?'pause':'play')}}>{blocked?'等待确认':playing?'暂停推进':index===steps.length-1?'记录已完成':'继续推进'}</Button></div></div>
  <div className="border-b border-line px-4 py-3"><div className="mb-2 flex justify-between text-xs"><span><span className={cn('mr-2 inline-block size-1.5 rounded-full',playing?'animate-pulse bg-blue-500':'bg-slate-400')}/>{current.title}</span><span className="text-ink-3">{index+1} / {steps.length}</span></div><div className="flex gap-1">{steps.map((s,i)=><button key={s.title} title={s.title} aria-label={`查看步骤：${s.title}`} onClick={()=>{onAction('seek',i)}} className={cn('h-1.5 flex-1 rounded-full',i<=index?'bg-volt':'bg-slate-100')}/>)}</div></div>
  {execution?<div className="min-h-0 flex-1 overflow-auto p-4"><div className="mb-4 grid grid-cols-3 gap-2">{[['命令记录',`${index+1} 条`],['测试结果',testResult?`${testResult.tests!.filter(t=>t.pass).length} / 4`:'待执行'],['构建状态',index===6?'成功':'待构建']].map(([label,value])=><div key={label} className="rounded-lg border border-line p-3"><p className="text-[10px] text-ink-3">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div><div className="space-y-2">{steps.slice(0,index+1).map((s,i)=><details key={s.title} open={i===index} className="overflow-hidden rounded-lg border border-line"><summary className="flex cursor-pointer items-center gap-3 bg-surface px-3 py-3 text-xs"><span className="font-mono text-ink-3">0{i+1}</span><span className="flex-1 font-medium">{s.title}</span><span className={s.failed?'text-rose-500':'text-emerald-600'}>{s.result}</span></summary><pre className="overflow-auto bg-[#111827] p-4 font-mono text-[11px] leading-6 text-slate-300"><span className="text-blue-300">$ {s.command}{'\n'}</span>{s.output.join('\n')}</pre></details>)}</div>{testResult&&<div className="mt-4 rounded-lg border border-line p-3"><h3 className="mb-2 text-xs font-semibold">最近测试 · {testResult.failed?'需要修复':'全部通过'}</h3>{testResult.tests!.map(t=><div key={t.name} className="flex justify-between border-t border-line py-2 text-xs"><span>{t.name}</span><span className={t.pass?'text-emerald-600':'text-rose-500'}>{t.pass?'✓ PASS':'× FAIL'}</span></div>)}</div>}</div>:<><div className="flex items-center justify-between border-b border-line px-4 py-2 text-[11px]"><code>⎇ {branch||'feat/snake-game'}</code><span className="text-ink-3">{Object.keys(files).length} 个文件 · 只读源码</span></div><div className="flex min-h-0 flex-1"><aside className="w-40 shrink-0 overflow-auto border-r border-line bg-surface py-3"><p className="px-3 pb-2 text-[10px] text-ink-3">文件资源管理器</p>{Object.keys(files).map(f=><button key={f} title={f} onClick={()=>setSelected(f)} className={cn('w-full truncate px-3 py-2 text-left font-mono text-[10px]',path===f?'bg-volt-soft text-volt-text':'text-ink-2')}>{f}</button>)}</aside><div className="flex min-w-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-line px-3 py-2"><code className="truncate text-[11px]">{path}</code><Button size="small" variant="ghost" onClick={()=>setDiff(v=>!v)}>{diff?'查看源码':'变更对比'}</Button></div><div className="min-h-0 flex-1 overflow-auto bg-[#111827] py-3 font-mono text-[11px] leading-6 text-slate-200">{display.map((line,i)=><div key={i} className={cn('flex min-w-max',line.kind==='add'&&'bg-emerald-500/10 text-emerald-300',line.kind==='remove'&&'bg-rose-500/10 text-rose-300')}><span className="w-10 shrink-0 pr-2 text-right text-slate-500">{i+1}</span><code className="whitespace-pre pr-4">{line.kind==='add'?'+ ':line.kind==='remove'?'- ':'  '}{line.text||' '}</code></div>)}</div></div></div><div className="max-h-36 shrink-0 overflow-auto border-t border-slate-700 bg-[#0c1220] px-4 py-3 font-mono text-[11px] leading-5 text-slate-400"><div className="mb-1 text-[10px] tracking-wider text-slate-500">TERMINAL · 示例输出</div><p className="text-blue-300">$ {current.command}</p>{current.output.map((line,i)=><p key={i}>{line}</p>)}</div></>}
 </div>
}
