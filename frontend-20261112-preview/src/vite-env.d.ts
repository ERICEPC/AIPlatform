/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** mock（默认）或 live */
  readonly VITE_API_MODE?: 'mock' | 'live'
  /** RaccoonX 控制台接口前缀，默认 /console/api */
  readonly VITE_API_BASE?: string
  /** Raccoon KnowledgeBase 接口前缀，默认同源 */
  readonly VITE_KB_API_BASE?: string
  /** 完整知识库应用地址 */
  readonly VITE_KB_APP_URL?: string
  /** 插件市场服务地址（集成 → 插件市场） */
  readonly VITE_MARKETPLACE_API?: string
}
