/*
  插件市场示例目录 + 已安装插件内存状态（集成模块所有 mock 的公共底座）。
  图标用 "tile:<字>:<色>" 表示，由页面渲染为字母色块，不加载外部图片。
*/
import type { I18nText, MarketplacePlugin, PluginCategory, PluginDeclaration, PluginDetail, PluginSource } from '../../integrations/types'
import { nowIso } from '../../http'

export const tile = (text: string, color: string) => `tile:${text}:${color}`
const zh = (zh_Hans: string, en_US = zh_Hans): I18nText => ({ zh_Hans, en_US })

type Seed = [org: string, name: string, label: string, brief: string, icon: string, installs: number, tags: string[], version?: string]

const seeds: Record<PluginCategory, Seed[]> = {
  'model': [
    ['langgenius', 'openai', 'OpenAI', 'GPT-4o、o3、GPT-4.1 等对话、向量、语音模型', tile('AI', '#10a37f'), 412000, ['llm']],
    ['langgenius', 'anthropic', 'Anthropic', 'Claude 系列模型，擅长长文本与代码', tile('A', '#c96442'), 188000, ['llm']],
    ['langgenius', 'bedrock', 'Amazon Bedrock', '通过 AWS 托管调用多家基础模型', tile('B', '#ff9900'), 64000, ['llm']],
    ['langgenius', 'azure_openai', 'Azure OpenAI', '企业级 OpenAI 模型部署，支持私有网络', tile('Az', '#0078d4'), 97000, ['llm']],
    ['langgenius', 'gemini', 'Gemini', 'Google 多模态模型，支持图片、视频理解', tile('G', '#4285f4'), 151000, ['llm']],
    ['langgenius', 'cohere', 'Cohere', 'Command 对话模型与高质量 Rerank 重排序', tile('Co', '#39594d'), 42000, ['rerank']],
    ['langgenius', 'huggingface_hub', 'Hugging Face', '调用 Hugging Face Hub 上的开源模型', tile('HF', '#ffb000'), 38000, ['llm']],
    ['langgenius', 'deepseek', '深度求索', 'DeepSeek-V3、DeepSeek-R1 推理模型', tile('深', '#4d6bfe'), 356000, ['llm'], '0.0.6'],
    ['langgenius', 'tongyi', '通义', '阿里云通义千问系列，含向量与语音模型', tile('通', '#615ced'), 203000, ['llm']],
    ['langgenius', 'volcengine_maas', '火山方舟', '豆包大模型与第三方模型统一接入', tile('火', '#1664ff'), 87000, ['llm']],
    ['langgenius', 'hunyuan', '腾讯混元', '腾讯混元大模型，支持对话与向量', tile('混', '#0052d9'), 31000, ['llm']],
    ['langgenius', 'ollama', 'Ollama', '在本机或内网运行开源模型', tile('Ol', '#3a3a3a'), 176000, ['llm']],
    ['langgenius', 'siliconflow', '硅基流动', '高性价比开源模型推理服务', tile('硅', '#7c3aed'), 124000, ['llm']],
    ['langgenius', 'openai_api_compatible', 'OpenAI 兼容接口', '任何兼容 OpenAI 协议的模型服务都能接入', tile('OC', '#2f6f5e'), 268000, ['llm'], '0.0.73'],
    ['sensetime', 'sensenova', 'SenseNova', '商汤日日新大模型，对话、向量与语音', tile('SN', '#e4002b'), 12000, ['llm'], '0.2.4'],
  ],
  'tool': [
    ['langgenius', 'feishu', '飞书', '发消息、建文档、查日程、操作多维表格', tile('飞', '#3370ff'), 98000, ['productivity'], '0.3.2'],
    ['langgenius', 'tavily', 'Tavily 搜索', '面向 AI 的实时网络搜索，返回可引用来源', tile('Tv', '#0f766e'), 143000, ['search'], '0.1.4'],
    ['langgenius', 'time', '时间', '获取当前时间、时区换算、星期计算', tile('时', '#64748b'), 210000, ['utilities'], '0.0.9'],
    ['langgenius', 'jina', 'Jina 网页阅读', '把任意网页转成干净的 Markdown', tile('Ji', '#e11d48'), 76000, ['search'], '0.2.0'],
    ['langgenius', 'wecom', '企业微信', '通过群机器人发送通知与卡片消息', tile('企', '#07c160'), 52000, ['social']],
    ['langgenius', 'dingtalk', '钉钉', '群机器人消息、待办与日程', tile('钉', '#1677ff'), 47000, ['social']],
    ['langgenius', 'amap', '高德地图', '地理编码、路径规划、周边搜索', tile('高', '#2b7cff'), 33000, ['travel']],
    ['langgenius', 'code', '代码执行', '在沙箱中运行 Python / Node.js 代码', tile('</>', '#334155'), 61000, ['utilities']],
    ['langgenius', 'github', 'GitHub', '查询仓库、Issue、PR 与提交记录', tile('GH', '#24292f'), 58000, ['productivity']],
    ['langgenius', 'comfyui', 'ComfyUI 图像生成', '调用 ComfyUI 工作流生成图片', tile('Cf', '#a855f7'), 29000, ['image']],
  ],
  'datasource': [
    ['langgenius', 'feishu_wiki', '飞书文档', '同步飞书知识库与云文档到知识库', tile('飞', '#3370ff'), 44000, ['productivity'], '0.1.8'],
    ['langgenius', 'notion_datasource', 'Notion', '导入 Notion 页面与数据库', tile('N', '#111111'), 81000, ['productivity']],
    ['langgenius', 'google_drive', 'Google Drive', '从 Google 云端硬盘导入文档与表格', tile('GD', '#1fa463'), 39000, ['productivity']],
    ['langgenius', 'firecrawl_datasource', '网页抓取', '整站抓取网页并转为结构化文本', tile('网', '#f97316'), 57000, ['search'], '0.2.1'],
    ['langgenius', 'yuque', '语雀', '同步语雀知识库文档', tile('雀', '#00b96b'), 18000, ['productivity']],
  ],
  'trigger': [
    ['langgenius', 'github_trigger', 'GitHub 事件', 'Push、PR、Issue 等仓库事件触发工作流', tile('GH', '#24292f'), 21000, ['dev'], '0.1.2'],
    ['langgenius', 'feishu_trigger', '飞书事件', '收到消息、审批通过、表格变更时触发', tile('飞', '#3370ff'), 16000, ['productivity'], '0.1.0'],
    ['langgenius', 'gmail_trigger', 'Gmail', '收到新邮件时触发工作流', tile('M', '#ea4335'), 12000, ['productivity']],
    ['langgenius', 'webhook_trigger', '通用 Webhook', '任何系统都可以通过 HTTP 回调触发', tile('Wh', '#0ea5e9'), 34000, ['utilities']],
  ],
  'agent-strategy': [
    ['langgenius', 'agent', '官方 Agent 策略', 'Function Calling 与 ReAct 两种推理方式', tile('Ag', '#16a34a'), 230000, ['agent'], '0.0.21'],
    ['langgenius', 'plan_execute', '规划执行策略', '先拆解计划再逐步执行，适合多步骤任务', tile('PE', '#9333ea'), 14000, ['agent']],
    ['sensetime', 'deep_research', '深度研究策略', '多轮检索、交叉验证、生成带引用的报告', tile('DR', '#0891b2'), 8000, ['agent']],
  ],
  'extension': [
    ['langgenius', 'feishu_bot', '飞书机器人', '把应用接成飞书机器人，在群聊里直接对话', tile('飞', '#3370ff'), 26000, ['social'], '0.1.5'],
    ['langgenius', 'oaicompat', 'OpenAI 兼容网关', '把工作流暴露成 OpenAI 兼容的接口', tile('OG', '#10a37f'), 19000, ['utilities'], '0.0.8'],
    ['langgenius', 'wecom_bot', '企业微信应答', '企业微信回调消息自动应答', tile('企', '#07c160'), 9000, ['social']],
  ],
}

const randomHash = () => Math.random().toString(16).slice(2, 10)

export const catalog: MarketplacePlugin[] = (Object.entries(seeds) as [PluginCategory, Seed[]][]).flatMap(([category, list]) =>
  list.map(([org, name, label, brief, icon, installs, tags, version = '0.1.0']) => {
    const latest = version
    return {
      type: 'plugin',
      category,
      org,
      name,
      plugin_id: `${org}/${name}`,
      version,
      latest_version: latest,
      latest_package_identifier: `${org}/${name}:${latest}@${randomHash()}`,
      icon,
      label: zh(label),
      brief: zh(brief),
      install_count: installs,
      tags: tags.map(t => ({ name: t })),
      verified: org === 'langgenius',
    } satisfies MarketplacePlugin
  }),
)

export const findCatalog = (pluginId: string) => catalog.find(c => c.plugin_id === pluginId)

export function declarationFrom(item: MarketplacePlugin, version = item.version): PluginDeclaration {
  return {
    plugin_unique_identifier: `${item.plugin_id}:${version}@${randomHash()}`,
    version,
    author: item.org,
    icon: item.icon,
    name: item.name,
    category: item.category,
    label: item.label,
    description: item.brief,
    created_at: nowIso(),
    tags: item.tags.map(t => t.name),
    verified: item.verified,
  }
}

export function detailFrom(decl: PluginDeclaration, source: PluginSource, latest = decl.version, meta?: PluginDetail['meta']): PluginDetail {
  const id = `${decl.author}/${decl.name}`
  return {
    id: `plg-${randomHash()}`,
    created_at: nowIso(),
    updated_at: nowIso(),
    name: decl.name,
    plugin_id: id,
    plugin_unique_identifier: decl.plugin_unique_identifier,
    declaration: decl,
    installation_id: `ins-${randomHash()}`,
    tenant_id: 'tenant-sensetime',
    endpoints_setups: 0,
    endpoints_active: 0,
    version: decl.version,
    latest_version: latest,
    latest_unique_identifier: decl.plugin_unique_identifier,
    source,
    meta,
    status: 'active',
    deprecated_reason: '',
    alternative_plugin_id: '',
  }
}

/* ---------- 已安装插件（所有分类共享） ---------- */
// 演示「有新版本」：飞书工具装的是旧版
const preinstalled: [string, PluginSource, string?][] = [
  ['langgenius/openai_api_compatible', 'marketplace'],
  ['sensetime/sensenova', 'github'],
  ['langgenius/deepseek', 'marketplace'],
  ['langgenius/feishu', 'marketplace', '0.3.0'],
  ['langgenius/tavily', 'marketplace'],
  ['langgenius/time', 'remote'],
  ['langgenius/jina', 'package'],
  ['langgenius/feishu_wiki', 'marketplace'],
  ['langgenius/firecrawl_datasource', 'marketplace'],
  ['langgenius/github_trigger', 'marketplace'],
  ['langgenius/feishu_trigger', 'marketplace'],
  ['langgenius/agent', 'marketplace'],
  ['langgenius/feishu_bot', 'marketplace'],
  ['langgenius/oaicompat', 'github'],
]

export const installed: PluginDetail[] = preinstalled.map(([pid, source, ver]) => {
  const item = findCatalog(pid)!
  const meta = source === 'github' ? { repo: `sensetime-raccoon/${item.name}-plugin`, version: `v${item.version}`, package: `${item.name}-${item.version}.pkg` } : undefined
  return detailFrom(declarationFrom(item, ver ?? item.version), source, item.latest_version, meta)
})

export const isInstalled = (pluginId: string) => installed.some(p => p.plugin_id === pluginId)
export const installedOf = (category: PluginCategory) => installed.filter(p => p.declaration.category === category)
export const pluginById = (pluginId: string) => installed.find(p => p.plugin_id === pluginId)
