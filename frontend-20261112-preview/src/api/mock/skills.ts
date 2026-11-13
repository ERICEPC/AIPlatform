/*
  Skills 模块 mock：内存状态。上传、GitHub 导入、市场安装、启停、删除都会立即反映到后续读取。
  市场数据是 SenseNova-Skills 仓库的快照（README_CN 技能表 + 各 SKILL.md 描述，提交 004a242）。
  只模拟后端返回，不含页面逻辑。
*/
import type { GithubInstallPayload, GithubResolveResult, LocalSkill, LocalSkillPatch, MarketCategory, MarketInstallResponse, MarketListResponse, MarketQuery, MarketSkill, NativeSkill, SkillFile } from '../skills'
import { mockId } from '../http'

const now = () => Math.floor(Date.now() / 1000)
const D = 86400
const REPO = 'OpenSenseNova/SenseNova-Skills'
const REPO_URL = `https://github.com/${REPO}`
const marketUrl = (name: string) => `${REPO_URL}/tree/main/skills/${name}`
const fail = (msg: string): never => { throw new Error(msg) }

/* ---------- 原生 ---------- */
const native = (id: string, name: string, description: string, group: NativeSkill['group'], icon: string, capabilities: string[], examples: string[], file_types?: string[]): NativeSkill =>
  ({ id, name, description, group, icon, enabled: true, capabilities, examples, file_types })

const NATIVE: NativeSkill[] = [
  native('docx', 'Word 文档', '创建、编辑和分析 Word 文档', 'document', 'word', ['按大纲生成带目录、页眉页脚的正式文档', '修订已有文档并保留格式与批注', '提取要点、比对两个版本的差异'], ['把这份会议纪要整理成正式的 Word 通知', '帮我比较合同 v2 和 v3 改了哪些条款'], ['.docx', '.doc']),
  native('pdf', 'PDF 工具', '提取、编辑、合并和生成 PDF', 'document', 'pdf', ['提取文字、表格和图片', '合并、拆分、旋转页面，添加水印', '把网页或 Markdown 生成 PDF'], ['把这三份 PDF 合成一份，按日期排序', '提取这份财报第 12–15 页的表格'], ['.pdf']),
  native('xlsx', 'Excel 表格', '读写表格、公式计算、透视汇总与图表', 'data', 'excel', ['清洗合并多张表格，处理重复和缺失', '写公式、做透视表和条件格式', '生成图表并导出为 Excel'], ['把 10 个月的考核表合成一张长表', '按区域汇总 Q3 商机金额并画柱状图'], ['.xlsx', '.xls', '.csv']),
  native('pptx', '演示文稿', '按大纲生成演示文稿，或修改已有 PPT', 'document', 'slides', ['根据主题和受众生成大纲与逐页内容', '套用模板配色，自动排版图文', '读取已有 PPT 并改写指定页面'], ['用这份方案做 12 页的售前汇报 PPT', '把第 5 页改成三栏对比的版式'], ['.pptx']),
  native('pdf2word', 'PDF 转 Word', '把 PDF 转成可编辑的 Word，保留版式和表格', 'document', 'convert', ['识别段落、标题层级与表格', '扫描件先做文字识别再转换'], ['把这份扫描版招标文件转成 Word'], ['.pdf']),
  native('convert', '格式转换', 'Word / PDF / 图片 / Markdown 互转', 'document', 'swap', ['Word、PDF、Markdown、HTML 之间互转', '图片转 PDF，PDF 按页转图片'], ['把这篇 Markdown 周报导出成 PDF', '把这份 PDF 每页转成 PNG'], ['.docx', '.pdf', '.md', '.png', '.jpg']),
  native('ocr', 'OCR 文字识别', '识别图片和扫描件中的文字与表格', 'document', 'ocr', ['识别中英文印刷体与常见手写体', '表格截图还原为可编辑表格'], ['识别这张发票上的金额和开票日期'], ['.png', '.jpg', '.pdf']),
  native('translate', '翻译', '文档与文本翻译，保留原文格式', 'document', 'translate', ['中英日韩等常用语种互译', '整篇文档翻译并保留排版', '支持术语表，统一专有名词'], ['把这份英文白皮书翻译成中文，保留目录结构']),
  native('dashboard', '数据看板', '把表格数据做成可交互的数据看板', 'data', 'dashboard', ['自动挑选指标与图表类型', '生成可筛选、可下钻的网页看板'], ['用这份销售明细做一个按月、按区域的看板']),
  native('visual', '视觉模板', '海报、信息图、封面等视觉模板一键套用', 'data', 'palette', ['从模板库挑选版式和配色', '把要点排成信息图或社媒配图'], ['把这次发布会的 5 个亮点做成一张长图']),
  native('research', '深度研究', '多轮检索、交叉验证，产出带引用的研究报告', 'productivity', 'research', ['先拆研究维度再定向检索', '不同来源的数字先核对再写入', '输出带脚注引用的报告'], ['调研一下国内具身智能行业的玩家和融资情况']),
  native('browser', '浏览器操作', '打开网页、点击、填写、抓取页面信息', 'productivity', 'browser', ['按步骤操作网页并截图留证', '抓取列表页数据整理成表格'], ['打开招标网站，找出本周和智慧园区相关的公告']),
  native('memory', '长期记忆', '记住你的偏好和项目背景，跨对话延续', 'productivity', 'memory', ['记住称呼、写作风格、常用模板', '按项目沉淀背景资料，随时可查看和删除'], ['记住：周报统一用「本周进展 / 风险 / 下周计划」三段式']),
  native('schedule', '定时任务', '按时间自动执行，例如每周一生成周报', 'productivity', 'timer', ['支持每天、每周、每月和自定义周期', '执行结果推送到对话或飞书'], ['每周一早上 9 点汇总上周商机变化发给我']),
  native('roadmap', '项目路线图', '拆解目标、排期里程碑，跟踪项目进展', 'productivity', 'roadmap', ['把目标拆成阶段、里程碑和任务', '生成甘特图，标出延期风险'], ['把翼飞客服二期拆成 6 周的路线图']),
]

/* ---------- 市场（SenseNova-Skills 快照） ---------- */
const SN_KEY = '需要 SenseNova 平台 API Key（platform.sensenova.cn 可领免费 Token 套餐）'
const m = (name: string, category: MarketCategory, tag: string, description: string, requires: string[] = [], depends_on: string[] = []): Omit<MarketSkill, 'installed' | 'local_id'> =>
  ({ name, category, tag, description, requires, depends_on })

const MARKET: Omit<MarketSkill, 'installed' | 'local_id'>[] = [
  m('sn-image-doctor', 'image', '环境诊断', '检查 SenseNova-Skills 环境，验证 sn-image-base 安装、Python 依赖与必填环境变量；交互式补齐缺失项并写入 .env。', ['Python 3'], ['sn-image-base']),
  m('sn-image-base', 'image', '图像基础层（Tier 0）', '提供文生图（sn-image-generate）、图像编辑（sn-image-edit）、图像识别（sn-image-recognize）与文本优化（sn-text-optimize）四个底层工具，统一通过 sn_agent_runner.py 调用，供上层技能复用。', [SN_KEY, 'Python 3']),
  m('sn-infographic', 'image', '信息图生成（Tier 1）', '自动评估提示词、从 87 种布局 / 66 种风格中选型，多轮生成 + VLM 评审 + 质量排序，输出专业级信息图。支持 SenseNova U1.5 Lite，包括原生 4K 输出。', [SN_KEY], ['sn-image-base']),
  m('sn-image-imitate', 'image', '图像风格模仿（Tier 1）', '给定一张参考图像和目标内容描述，模仿其风格生成新图像。', [SN_KEY], ['sn-image-base']),
  m('sn-image-resume', 'image', '简历图片生成（Tier 1）', '给定一份简历信息，生成简历图片。', [SN_KEY], ['sn-image-base']),

  m('sn-ppt-entry', 'ppt', 'PPT 入口', 'PPT 生成统一入口：收集角色 / 受众 / 场景 / 页数 / 模式（标准 / 动态 / 创意），解析 pdf / docx / md / txt 输入，产出 task_pack.json + info_pack.json 并分派到下游模式。', [SN_KEY], ['sn-ppt-story']),
  m('sn-ppt-story', 'ppt', 'PPT 编排', '入口到出口之间的强制中间环节：将 query、用户材料与已完成 Research 编排为唯一可编辑的 outline.md；不得跳过或代写。'),
  m('sn-ppt-standard', 'ppt', 'PPT 标准模式', '风格规范 → 大纲 → 资产规划 + 分槽位图像 + VLM 质检 → 分页 HTML → 分页评审 → build present.html；由自带 HTML→PPTX 导出器导出 PPTX。', [SN_KEY, 'Playwright + Chromium（导出 PPTX）'], ['sn-ppt-entry']),
  m('sn-ppt-dazzle', 'ppt', 'PPT 动态模式', '将已备好的 outline.md 制作为 1280×720 单文件动态 HTML 演示文稿（动效、跨页过渡、键盘翻页），用于动态 / 交互演示场景。', [], ['sn-ppt-entry']),
  m('sn-ppt-creative', 'ppt', 'PPT 创意模式', '每页一张 16:9 全图（PNG），按页面构图 prompt 出图后导出 PPTX。', [SN_KEY], ['sn-ppt-entry']),
  m('sn-ppt-doctor', 'ppt', 'PPT 环境诊断', '检查本地渲染 / 导出依赖（Python/Node Playwright、Chromium、PPTX exporter）与 Bundled 媒体配置；只报告，不写 .env、不修改任务目录。', ['Python 3 / Node.js']),
  m('sn-ppt-tools', 'ppt', 'Bundled 工具回退', '宿主原生搜索 / 生图工具缺失或失败时提供回退：普通搜索、图片搜索、图片生成与下载；读取 .env 中的 SN_PPT_* 配置。', ['环境变量 SN_PPT_*']),
  m('sn-ppt-workbench', 'ppt', 'PPT 编辑工作台', '对已生成的 HTML deck 打开或复用 AI PPT 编辑 WebUI：预览、检查与在线可视化微调；不重新生成、不直接修改文件。'),

  m('sn-da-excel-workflow', 'data', 'Excel 分析编排', 'Excel 多表读取、大文件检测（≥10k 行触发 Parquet 优化）、清洗、条件过滤、跨表聚合、Excel/CSV 导出的全流程编排。', ['Python 3（pandas / openpyxl）']),
  m('sn-da-image-caption', 'data', '图像理解与数据提取', '图像类输入做表格 OCR / 图表解读 / 截图描述 / UI 描述；可解析为 DataFrame、复绘可视化、导出 Excel/CSV。', [SN_KEY]),
  m('sn-da-large-file-analysis', 'data', '大文件高性能分析', '≥10k 行 Excel 的流式读取（openpyxl read_only + iter_rows）、Parquet 转换、内存优化、分块处理与大文件写入模式。', ['Python 3（pyarrow）']),
  m('sn-da-non-spreadsheet-analysis', 'data', '文档解析与分析', 'Word / PDF / PPT 文档解析与数据分析引擎：覆盖三类文件格式的全量提取、表格数值化、图表理解与跨文档汇总分析。', ['Python 3']),

  m('sn-deep-research', 'research', '深度研究入口', '按档位编排的深度研究统一入口，支持并行研究工作包、quick / normal 一次综合，以及可审计的 heavy 完整流程，最终产出 report.md。', [SN_KEY], ['sn-research-report', 'sn-prepare-citations']),
  m('sn-deepresearch-cli', 'research', '深度研究 CLI', '安装并运行独立的 sensenova-skills-deepresearch CLI，通过用户选择的 Harness 或 Agent 编排搜索、研究、监控、恢复与报告导出。', ['Python 3', SN_KEY]),
  m('sn-research-report', 'research', '终稿写作 / 改写', '把判断层落成最终 report.md；也可对已有报告做重写、润色、重组结构、补充表格等定向编辑。'),
  m('sn-report-format-discovery', 'research', '报告呈现形式发现', '比较研究报告、学术论文、表格优先报表、决策备忘录或自定义 Markdown 形式，选出最终呈现方式。'),
  m('sn-prepare-citations', 'research', '引用渲染', '将 [^source_id] 脚注后处理为编号引用，并基于 evidence sources 追加参考文献。'),

  m('sn-search-academic', 'search', '学术搜索', 'ArXiv（含 HTML 全文按章节读）/ Semantic Scholar（含引用数）/ PubMed（含 PMC 开放获取全文）/ Wikipedia 四平台聚合。'),
  m('sn-search-code', 'search', '开发者搜索', 'GitHub（仓库 / 代码 / Issue）/ Stack Overflow / Hacker News / HuggingFace（模型 / 数据集 / Space）四平台聚合。', ['可选 GITHUB_TOKEN 提高限额']),
  m('sn-search-social-cn', 'search', '中文社交搜索', 'B 站 / 知乎 / 抖音 三个中文社交平台搜索；部分平台需 cookie 认证。', ['部分平台需要 cookie']),
  m('sn-search-social-en', 'search', '英文社交搜索', 'Reddit / Twitter (X) / YouTube 三个英文社交平台搜索。'),
  m('sn-search-social-media', 'search', '社媒热点搜索', '搜索社区、社媒、新闻热点、百科趋势、开发者生态和技术讨论；只用免费、免注册、免 API Key 的数据源。'),
  m('sn-search-finance', 'search', '金融财经搜索', '搜索金融市场、证券、上市公司基本面、价格、K 线、披露文件、财经新闻、A 股、港股或全球 ticker，可使用 yfinance、mootdx、API 脚本或 browser-use。', ['Python 3（yfinance / mootdx）']),
  m('sn-search-market-cn', 'search', '中国市场商业搜索', '研究中国市场、行业、宏观、贸易、采购、上市公司披露、监管、知识产权、医疗、物流、能源等信息，只使用免注册、免 API Key 的官方免费来源。'),
  m('sn-search-year-report', 'search', '年报搜索', '搜索免费官方年报、年度报告、定期报告、上市公司披露文件、债券发行人报告和海外公司年度账目。'),
  m('sn-search-image', 'search', '图片搜索', '基于 Serper.dev 的 Google 图片检索，返回图片地址、所在页面、标题与来源域名。', ['环境变量 SERPER_API_KEY', 'Python 3']),

  m('sn-code-video', 'video', '代码视频', '制作与修改由代码绘制的 MP4 视频，提供确定性逐帧渲染、8 份创作指南、可选音效与旁白、联系表画面检查及最终文件验证。', ['本地渲染环境（Node.js / FFmpeg）']),

  m('sn-motion-html', 'html', 'Motion HTML 故事', '制作沉浸式滚动网页故事，包含连续镜头、风格一致的静帧、Seedance 视频片段、结构化内容与响应式浏览器交付。', [SN_KEY, '视频片段需要 Seedance 接口']),
  m('sn-md-to-html-report', 'html', 'Markdown → HTML 报告', '将 Markdown 报告重组为自包含 HTML 专题页，处理编辑结构、证据顺序、响应式布局与离线资源。'),

  m('sn-team-harness', 'collab', 'Team Harness', '一个让人和本地 Agent 共享上下文、项目、工作项、资源与版本化成果的自托管协作工作区。', ['需要自托管部署']),
  m('sn-proactive-agent', 'collab', 'Proactive Agent', '记录长期项目进展，维护可审计的 Project / Item / Event 状态，并在 Web 工作台展示下一步建议；用户接受后由原 Hermes 或 OpenClaw Session 继续执行。', ['需要已配置模型的 Hermes CLI']),

  m('sn-update', 'other', '技能更新', '更新已安装的 SenseNova Skills（sn-* 全套）；指定技能名时只更新对应技能。'),
]

const MARKET_SYNC = { repo: REPO, url: REPO_URL, synced_at: 1793690871, commit: '004a242' }

/* ---------- 本地（内存状态） ---------- */
const skillFiles = (extra: string[] = []): SkillFile[] => [
  { path: 'SKILL.md', size: 2000 + Math.floor(Math.random() * 6000) },
  ...extra.map(p => ({ path: p, size: 600 + Math.floor(Math.random() * 12000) })),
]

let local: LocalSkill[] = [
  {
    id: 'ls-ticket',
    name: '售后工单分类',
    description: '按故障现象把翼飞售后工单分到硬件、网络、账号、物流四类，并给出优先级建议。',
    source: 'upload',
    version: '1.2.0',
    enabled: true,
    installed_at: now() - 12 * D,
    updated_at: now() - 3 * D,
    file_name: 'ticket-classify.zip',
    files: skillFiles(['references/分类规则.md', 'references/示例工单.json', 'scripts/classify.py']),
    installed_by: '周玮',
  },
  {
    id: 'ls-weekly',
    name: 'opportunity-weekly',
    description: '汇总 CRM 商机变化，按「新增 / 推进 / 风险」生成商机周报 Markdown。',
    source: 'github',
    version: '0.4.1',
    enabled: true,
    installed_at: now() - 20 * D,
    updated_at: now() - 9 * D,
    source_url: 'https://github.com/raccoon-fde/sales-skills/tree/main/skills/opportunity-weekly',
    ref: 'main',
    has_update: true,
    files: skillFiles(['templates/weekly.md', 'scripts/fetch_crm.py']),
    installed_by: '李鹏程',
  },
  {
    id: 'ls-proposal',
    name: '售前方案提纲',
    description: '根据客户行业和需求清单生成售前方案提纲与报价说明模板。',
    source: 'upload',
    version: '1.0.0',
    enabled: false,
    installed_at: now() - 30 * D,
    updated_at: now() - 30 * D,
    file_name: 'SKILL.md',
    files: skillFiles(),
    installed_by: '叶源',
  },
]

const find = (id: string) => local.find(s => s.id === id) ?? fail('技能不存在或已被删除')
const byName = (name: string) => local.find(s => s.name === name)
const bump = (v: string) => {
  const [a, b, c] = v.split('.').map(n => Number(n) || 0)
  return `${a}.${b}.${c + 1}`
}

/** 读 SKILL.md front matter 的 name / description */
function frontMatter(text: string) {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
  const pick = (k: string) => new RegExp(`^${k}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(fm)?.[1]?.trim()
  return { name: pick('name'), description: pick('description'), version: pick('version') }
}

function parseGithub(url: string) {
  const r = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([\w.-]+)(?:\/(.*?))?)?\/?$/.exec(url.trim())
  if (!r)
    return fail('不是有效的 GitHub 仓库或目录地址')
  const path = (r[4] ?? '').replace(/\/?SKILL\.md$/i, '')
  return { owner: r[1], repo: r[2], ref: r[3] ?? 'main', path }
}

function addLocal(s: Omit<LocalSkill, 'id' | 'installed_at' | 'updated_at' | 'enabled' | 'installed_by'>) {
  const exists = byName(s.name)
  const t = now()
  if (exists) {
    Object.assign(exists, s, { updated_at: t, has_update: false })
    return exists
  }
  const row: LocalSkill = { ...s, id: mockId('ls'), enabled: true, installed_at: t, updated_at: t, installed_by: '李鹏程' }
  local = [row, ...local]
  return row
}

const marketRow = (x: (typeof MARKET)[number]): MarketSkill => {
  const l = local.find(s => s.source === 'market' && s.name === x.name)
  return { ...x, installed: !!l, local_id: l?.id ?? null }
}

function installOneFromMarket(name: string) {
  const x = MARKET.find(s => s.name === name) ?? fail(`市场中没有技能「${name}」`)
  const other = byName(name)
  if (other && other.source !== 'market')
    fail(`本地已有同名技能「${name}」（来源：${other.source === 'github' ? 'GitHub' : '上传'}），请先删除后再安装`)
  return addLocal({ name: x.name, description: x.description, source: 'market', version: '1.0.0', source_url: marketUrl(x.name), ref: 'main', has_update: false, files: skillFiles(['references/README.md', 'scripts/run.py']) })
}

export const db = {
  listNative: () => ({ data: NATIVE }),

  listLocal: () => ({ data: local }),
  getLocal: (id: string) => find(id),

  async upload(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['md', 'json', 'zip'].includes(ext ?? ''))
      fail('只支持 SKILL.md、.json 或 .zip 技能包')
    if (file.size > 20 * 1024 * 1024)
      fail('文件超过 20 MB，请精简后再上传')
    let name = file.name.replace(/\.(md|json|zip)$/i, '')
    let description = '用户上传的技能'
    let version = '1.0.0'
    let files: SkillFile[] = [{ path: 'SKILL.md', size: file.size }]
    if (ext === 'md') {
      const fm = frontMatter(await file.text())
      if (!fm.name || !fm.description)
        fail('SKILL.md 缺少 front matter 中的 name 或 description')
      name = fm.name!
      description = fm.description!
      version = fm.version ?? version
    }
    else if (ext === 'json') {
      let j: { name?: string, description?: string, version?: string }
      try {
        j = JSON.parse(await file.text())
      }
      catch {
        return fail('JSON 解析失败，请检查文件格式')
      }
      if (!j.name || !j.description)
        fail('JSON 中缺少 name 或 description 字段')
      name = j.name!
      description = j.description!
      version = j.version ?? version
      files = [{ path: 'skill.json', size: file.size }]
    }
    else {
      if (name === 'SKILL' || !name)
        name = `skill-${Math.random().toString(36).slice(2, 6)}`
      description = `从技能包 ${file.name} 解析：包含 SKILL.md 与支撑脚本。`
      files = skillFiles(['references/guide.md', 'scripts/main.py'])
    }
    const exists = byName(name)
    if (exists && exists.source !== 'upload')
      fail(`已存在同名技能「${name}」，请先删除或修改 SKILL.md 中的 name`)
    return addLocal({ name, description, source: 'upload', version: exists ? bump(exists.version) : version, file_name: file.name, files })
  },

  resolveGithub(url: string): GithubResolveResult {
    const g = parseGithub(url)
    if (/not-?found|empty/i.test(g.path) || g.repo.toLowerCase() === 'empty')
      fail('该目录下没有找到 SKILL.md，请确认地址指向技能所在目录')
    const name = g.path ? g.path.split('/').pop()! : g.repo
    const fromMarket = `${g.owner}/${g.repo}` === REPO ? MARKET.find(s => s.name === name) : undefined
    return {
      url,
      ...g,
      name,
      description: fromMarket?.description ?? `${g.owner}/${g.repo} 中的技能「${name}」，按 SKILL.md 声明的触发条件被助手调用。`,
      version: '1.0.0',
      files: skillFiles(['references/usage.md', 'scripts/run.py', 'assets/template.md']),
      installed_id: byName(name)?.id ?? null,
    }
  },

  installGithub(body: GithubInstallPayload) {
    const r = db.resolveGithub(body.url)
    const exists = byName(r.name)
    if (exists && exists.source !== 'github')
      fail(`已存在同名技能「${r.name}」（来源：${exists.source === 'market' ? '市场' : '上传'}），请先删除`)
    const base = `https://github.com/${r.owner}/${r.repo}`
    return addLocal({ name: r.name, description: r.description, source: 'github', version: exists ? bump(exists.version) : r.version, source_url: body.path ? `${base}/tree/${body.ref}/${body.path}` : base, ref: body.ref, has_update: false, files: r.files })
  },

  updateLocal(id: string) {
    const s = find(id)
    if (s.source === 'upload')
      fail('上传的技能没有远端来源，请重新上传新版本')
    Object.assign(s, { version: bump(s.version), has_update: false, updated_at: now() })
    return s
  },

  patchLocal(id: string, body: LocalSkillPatch) {
    const s = find(id)
    Object.assign(s, body, { updated_at: now() })
    return s
  },

  deleteLocal(id: string) {
    find(id)
    local = local.filter(s => s.id !== id)
    return { result: 'success' as const }
  },

  listMarket(q: MarketQuery): MarketListResponse {
    const kw = q.keyword?.trim().toLowerCase()
    const cats = [...new Set(MARKET.map(s => s.category))]
    return {
      source: { ...MARKET_SYNC },
      categories: cats.map(id => ({ id, count: MARKET.filter(s => s.category === id).length })),
      data: MARKET
        .filter(s => !q.category || s.category === q.category)
        .filter(s => !kw || `${s.name} ${s.tag} ${s.description}`.toLowerCase().includes(kw))
        .map(marketRow),
    }
  },

  installMarket(name: string): MarketInstallResponse {
    const x = MARKET.find(s => s.name === name) ?? fail(`市场中没有技能「${name}」`)
    // 依赖递归安装（跳过已安装的）
    const deps: string[] = []
    const walk = (n: string, seen: Set<string>) => {
      for (const d of MARKET.find(s => s.name === n)?.depends_on ?? []) {
        if (seen.has(d))
          continue
        seen.add(d)
        walk(d, seen)
        if (!byName(d)) {
          installOneFromMarket(d)
          deps.push(d)
        }
      }
    }
    walk(x.name, new Set([x.name]))
    return { skill: installOneFromMarket(name), installed_dependencies: deps }
  },
}

