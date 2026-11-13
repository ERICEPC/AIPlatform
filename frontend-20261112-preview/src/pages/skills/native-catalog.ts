// Product capability catalogue; availability is not implied by this list.
import type { NativeSkill } from '@/api/skills'
const native = (id: string, name: string, description: string, group: NativeSkill['group'], icon: string, capabilities: string[], examples: string[], file_types?: string[]): NativeSkill =>
  ({ id, name, description, group, icon, enabled: false, capabilities, examples, file_types })

export const NATIVE: NativeSkill[] = [
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
  native('code', '代码开发与测试', '分析、修改、测试并交付代码', 'productivity', 'code', ['读取项目结构并制定实现计划', '运行测试、类型检查和构建', '输出变更摘要与验证证据'], ['帮我修复这个接口并运行项目测试']),
  native('git', 'Git 与代码评审', '安全地查看差异、管理分支和准备补丁', 'productivity', 'git', ['检查工作区和分支状态', '生成可审阅的 diff 和提交说明', '按授权创建补丁或 PR'], ['检查当前改动并给我一份评审摘要']),
  native('web-search', '联网搜索与引用', '检索公开网页并生成可核查引用', 'productivity', 'search', ['按时间和来源筛选搜索结果', '交叉核对关键事实', '输出带 URL 和访问日期的引用'], ['调研这个技术方案并附上来源']),
  native('image', '图片处理', '裁剪、转换、拼接和检查图片', 'document', 'image', ['批量调整尺寸和格式', '去除空白、拼接或加水印', '检查透明度与清晰度'], ['把这几张截图拼成一张长图']),
  native('citations', '来源与证据整理', '把文件和网页结果整理成证据包', 'productivity', 'research', ['建立来源、定位和访问时间表', '将引用放在对应结论附近', '区分事实、推断和建议'], ['把这份调研整理成带证据索引的报告']),
]

