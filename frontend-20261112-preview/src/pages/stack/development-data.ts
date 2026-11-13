export type DevAsset = { id:string, kind:'template'|'module', name:string, description:string, category:string, stack:string, version:string, builtin:boolean, repo:string, skill:string, features:string[], tags:string[] }
const row=(id:string,kind:DevAsset['kind'],name:string,description:string,category:string,stack:string,features:string[],tags:string[]):DevAsset=>({id,kind,name,description,category,stack,version:'1.0.0',builtin:true,repo:`https://github.com/example/${id}`,skill:`skills/${id}/SKILL.md`,features,tags})
export const builtins:DevAsset[]=[
row('miniapp','template','小程序应用底座','从页面路由、用户体系到基础服务，快速搭建移动业务原型。','移动应用','Taro · React',['首页与导航','登录与个人中心','API 请求层'],['小程序','移动','预约']),
row('commerce','template','电商业务平台','商品、购物车、订单与管理后台的完整业务框架。','电商平台','Next.js · TypeScript',['商品目录','订单基础模型','后台管理壳'],['电商','商城','商品']),
row('support','template','智能客服工作台','会话、知识检索与人工接待的客服产品框架。','智能应用','React · TypeScript',['会话工作台','知识检索接口','接待工作流'],['客服','问答','知识']),
row('workspace','template','企业协作平台','适合项目管理、审批和内部业务系统的通用底座。','企业应用','React · TypeScript',['工作空间','导航与权限壳','标准数据表格'],['项目','管理','协作']),
row('auth','module','身份与权限','登录、角色和数据访问范围，统一企业应用身份体系。','基础能力','React · TypeScript',['登录组件','RBAC 权限','组织成员'],['登录','权限','企业']),
row('payment','module','订单与支付','订单状态与支付适配层，支付凭证由项目环境单独配置。','交易能力','TypeScript',['订单流程','支付适配器','退款入口'],['电商','商城','支付']),
row('knowledge','module','知识问答','组合检索、引用和回答组件，构建可追溯的知识体验。','AI 能力','React · TypeScript',['检索面板','来源引用','回答流'],['客服','问答','知识']),
row('analytics','module','数据分析看板','可复用指标卡、趋势图和筛选器，减少重复开发。','数据能力','React · TypeScript',['指标组件','图表组件','筛选工具栏'],['数据','分析','看板']),
row('workflow','module','审批与任务流','表单、任务分配和流程状态，适配常见企业业务。','业务能力','React · TypeScript',['流程状态','审批表单','任务队列'],['审批','项目','协作']),
row('notification','module','消息通知','站内信与消息模板，统一产品通知体验。','基础能力','TypeScript',['通知中心','消息模板','事件适配'],['消息','通知','提醒']),
row('weekly-collector','module','周报数据汇总','按人员、项目与统计周期汇总任务、工时和交付记录，为周报提供可追溯的数据输入。','周报协作','TypeScript',['多来源数据适配','周周期与人员筛选','去重与来源追溯'],['周报','汇总','工时','任务']),
row('weekly-editor','module','周报生成与编辑','将本周进展、问题风险和下周计划整理为结构化周报，支持模板配置与人工修订。','周报协作','React · TypeScript',['结构化周报模板','Markdown 编辑与预览','草稿保存与版本对比'],['周报','生成','编辑','计划']),
row('weekly-team-rollup','module','团队周报聚合','聚合成员周报，按项目汇总成果、阻塞项和协作需求，帮助负责人快速形成团队周报。','周报协作','React · TypeScript',['成员提交状态','按项目聚合','重复事项合并'],['周报','团队','聚合','协作']),
row('weekly-risk-tracker','module','周报风险与行动项','从周报中整理风险和待办，明确负责人、截止时间与处理状态，延续到下一周期跟踪。','周报协作','React · TypeScript',['风险清单','行动项负责人及期限','跨周跟踪'],['周报','风险','行动项','跟踪']),
row('weekly-delivery','module','周报定时提醒与分发','配置提交提醒和分发计划，经人工确认后将周报发送至指定渠道，并记录分发结果。','周报协作','TypeScript',['提交提醒','定时分发配置','渠道适配与发送记录'],['周报','提醒','分发','定时']),

]
export function readAssets():DevAsset[]{try{return [...builtins,...JSON.parse(localStorage.getItem('rx-dev-assets-v1')||'[]')]}catch{return builtins}}
export function saveAsset(asset:DevAsset){const custom=readAssets().filter(a=>!a.builtin&&a.id!==asset.id);localStorage.setItem('rx-dev-assets-v1',JSON.stringify([...custom,asset]))}
export function pickAsset(asset:DevAsset){const selected=readSelection();if(asset.kind==='template')selected.template=asset.id;else selected.modules=[...new Set([...selected.modules,asset.id])];localStorage.setItem('rx-dev-selection',JSON.stringify(selected))}
export function readSelection():{template:string,modules:string[]}{try{return JSON.parse(localStorage.getItem('rx-dev-selection')||'{"template":"","modules":[]}')}catch{return {template:'',modules:[]}}}
