import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // 部署子路径，例如 VITE_BASE=/raccoonx/（默认根路径）
  base: process.env.VITE_BASE || '/new-ui/',
  plugins: [react(), tailwindcss()],
  // 静态资源在 public/（Logo、小浣熊头像），路径与线上 nginx 一致，不依赖 installer/
  resolve: {
    alias: { '@': here('./src') },
  },
  build: {
    rollupOptions: {
      // 两个页面：门户原型 + 设计包挑选页
      input: { portal: here('./index.html'), kit: here('./design-kit.html') },
    },
  },
})
