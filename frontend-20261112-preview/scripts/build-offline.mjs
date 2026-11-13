// 把门户和设计包各打成一个可以双击打开的单文件 HTML（file:// 也能用，不联网）。
// 做法：每个页面单独 build（动态 import 内联、静态资源全部内联），
// 再把 JS / CSS 写回 HTML，并把用到的公共图片（Logo、小浣熊头像）转成 data URI。
// 用法：pnpm build:offline  →  输出 RaccoonX-新前端.html、RaccoonX-设计包.html
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const outDir = join(root, 'node_modules/.offline-build')

const pages = [
  { entry: 'index.html', target: 'RaccoonX-新前端.html' },
  { entry: 'design-kit.html', target: 'RaccoonX-设计包.html' },
]

const mime = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }
const dataUri = (rel) => {
  const ext = rel.slice(rel.lastIndexOf('.'))
  return `data:${mime[ext]};base64,${readFileSync(join(publicDir, rel)).toString('base64')}`
}

// 运行时拼接的头像路径：把源码里出现过的小浣熊表情全部放进资源表
function emojiTable() {
  const walk = d => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []))
  const text = walk(join(root, 'src')).map(f => readFileSync(f, 'utf8')).join('\n')
  const table = {}
  for (const name of new Set(text.match(/\b\d{3}-[a-z][a-z-]*\b/g))) {
    try {
      table[`/raccoon-emoji-v1/${name}.webp`] = dataUri(`raccoon-emoji-v1/${name}.webp`)
    }
    catch {}
  }
  // 登录页用 <img> 引用的品牌标识也放进资源表（CSS 里的 Logo 另行内联）
  for (const f of ['horizontal-zh-white.svg', 'horizontal-zh-navy.svg'])
    table[`/brand-assets/${f}`] = dataUri(`brand-assets/${f}`)
  return table
}
const table = emojiTable()

for (const { entry, target } of pages) {
  // 不读 vite.config.ts：那里的双页面入口会被合并进来，导致无法内联成单文件
  await build({
    root,
    configFile: false,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': join(root, 'src') } },
    base: './',
    logLevel: 'error',
    build: {
      outDir,
      emptyOutDir: true,
      copyPublicDir: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      modulePreload: false,
      chunkSizeWarningLimit: 4096,
      rollupOptions: {
        input: { main: join(root, entry) },
        output: { codeSplitting: false },
      },
    },
  })

  let html = readFileSync(join(outDir, entry), 'utf8')
  const assetsDir = join(outDir, 'assets')
  const files = readdirSync(assetsDir)

  // CSS 内联，顺带把 /brand-assets/… 的 Logo 换成 data URI
  let css = files.filter(f => f.endsWith('.css')).map(f => readFileSync(join(assetsDir, f), 'utf8')).join('\n')
  // base 为 './' 时 Vite 会把路径改写成 ../brand-assets/…，两种写法都要匹配
  css = css.replace(/url\((['"]?)(?:\.{0,2}\/)?(brand-assets\/[^'")]+)\1\)/g, (_, q, rel) => `url(${q}${dataUri(rel)}${q})`)

  // JS 内联（模块脚本可以内联，file:// 下也能执行）
  const js = files.filter(f => f.endsWith('.js')).map(f => readFileSync(join(assetsDir, f), 'utf8')).join('\n').replace(/<\/script/gi, '<\\/script')

  // 替换值一律用函数：JS 里的 $& / $' 等字符不能被当成替换模式
  html = html.replace(/<link rel="stylesheet"[^>]*>/g, '')
  // 运行时配置文件只用于部署版；离线单文件固定使用演示数据
  html = html.replace(/<script src="[^"]*rx-config\.js"><\/script>\s*/g, '')
  html = html.replace(/<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/g, '')
  html = html.replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" href="${dataUri('fde-tab.png')}">`)
  html = html.replace('</head>', () => `<style>${css}</style>\n<script>window.__RX_ASSETS__=${JSON.stringify(table)}</script>\n</head>`)
  html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`)

  writeFileSync(join(root, target), html)
  console.log(`已生成 ${target}（${(html.length / 1024 / 1024).toFixed(2)} MB）`)
}

rmSync(outDir, { recursive: true, force: true })
console.log(`内联头像 ${Object.keys(table).length} 个`)
