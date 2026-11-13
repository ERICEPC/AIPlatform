/*
  连接器目录快照（三）：github.com/volcengine/mcp-server 的 server/ 目录，共 84 个火山引擎官方 MCP Server。
  启动方式统一为 uvx 从仓库子目录运行（与各 README 一致），凭证为火山引擎 AK/SK + 地域。
  名称与描述取自仓库 README 的服务列表；列表未收录的按各子目录 README 概括。
*/
import type { ConnectorCategory, ConnectorField } from '../../integrations/connectors'
import type { ConnectorDef } from './connectors-kit'
import { field, gh, optional, secret } from './connectors-kit'

const AKSK: ConnectorField[] = [
  field('VOLCENGINE_ACCESS_KEY', 'Access Key ID', { hint: '火山引擎控制台 → 访问控制 → 密钥管理；建议使用权限受限的子用户密钥' }),
  secret('VOLCENGINE_SECRET_KEY', 'Secret Access Key'),
  optional('VOLCENGINE_REGION', '地域', { placeholder: 'cn-beijing' }),
]

type Row = [dir: string, name: string, mono: string, category: ConnectorCategory, tags: string[], description: string, capabilities: string[], extra?: ConnectorField[]]

const rows: Row[] = [
  /* 计算 */
  ['ecs', '云服务器 ECS', 'ECS', 'cloud', ['计算', '实例', '镜像'], '自然语言管理云服务器实例与镜像：查询、启停、重启、查看规格与监控。', ['DescribeInstances 查询实例', 'StartInstance / StopInstance', 'DescribeImages 镜像', 'DescribeInstanceTypes 规格']],
  ['cloud_assistant', '云助手', '云助', 'cloud', ['计算', '远程命令'], '向云服务器实例批量下发并执行自定义命令，查看执行结果。', ['RunCommand 执行命令', 'DescribeInvocationResults 查看结果']],
  ['ebs', '弹性块存储 EBS', 'EBS', 'cloud', ['存储', '云盘', '快照'], '查询云盘与快照信息，把块存储管理能力接入 AI 应用。', ['DescribeVolumes 云盘', 'DescribeSnapshots 快照']],
  ['tos', '对象存储 TOS', 'TOS', 'cloud', ['存储', '桶', '对象'], '基于 MCP 管理 TOS 桶与对象，智能化探索存储中的数据。', ['list_buckets 桶列表', 'list_objects 对象列表', 'get_object 读取对象'], [optional('TOS_ENDPOINT', '接入点', { placeholder: 'tos-cn-beijing.volces.com' }), optional('TOS_BUCKET', '限定访问的桶')]],
  ['tls', '日志服务 TLS', 'TLS', 'cloud', ['日志', '检索分析'], '自然语言驱动的日志检索与分析，自动生成查询语句。', ['search_logs 日志检索', 'text2sql 生成分析语句', 'describe_topics 日志主题']],
  /* 数据库 */
  ['rds_mysql', '云数据库 MySQL', 'RDS', 'database', ['MySQL', '实例管理'], '即开即用的托管 MySQL：查询实例、数据库、账号、参数与慢日志。', ['describe_db_instances', 'describe_databases', 'describe_db_accounts', 'describe_slow_logs']],
  ['rds_postgresql', '云数据库 PostgreSQL', 'PG', 'database', ['PostgreSQL', '实例管理'], '管理托管 PostgreSQL 实例：实例详情、数据库、账号与参数模板。', ['describe_db_instances', 'describe_databases', 'describe_db_accounts']],
  ['rds_mssql', '云数据库 SQL Server', 'SQL', 'database', ['SQL Server', '实例管理'], '查询托管 SQL Server 实例、数据库、备份与参数配置。', ['describe_db_instances', 'describe_backups', 'describe_db_instance_parameters']],
  ['vedb_mysql', '云数据库 veDB MySQL', 'veDB', 'database', ['存算分离', 'MySQL'], '计算存储分离、100% 兼容 MySQL，最多支持 200TiB 数据；查询集群、节点与账号。', ['describe_db_instances', 'describe_db_endpoint', 'describe_databases']],
  ['redis', '缓存数据库 Redis', 'Redis', 'database', ['缓存', '实例管理'], '自然语言管理火山引擎 Redis 实例：规格、白名单、备份与大 Key 分析。', ['describe_db_instances', 'describe_allow_lists', 'describe_backups', 'describe_big_keys']],
  ['mongodb', '文档数据库 MongoDB', 'Mongo', 'database', ['文档数据库', '命令执行'], '向火山引擎 MongoDB 实例发送并执行命令，查询实例与节点信息。', ['describe_db_instances', 'execute_command']],
  ['hbase', '云数据库 HBase', 'HBase', 'database', ['宽表', '实例管理'], '查询 HBase 实例、节点规格、连接地址与监控信息。', ['describe_db_instances', 'describe_endpoints']],
  ['cloudsearch', '云搜索服务', 'ES', 'database', ['Elasticsearch', 'OpenSearch', '检索'], '全托管一站式信息检索与分析平台：管理实例、查看集群状态。', ['describe_instances', 'describe_instance_nodes']],
  ['supabase', 'Supabase', 'SB', 'database', ['Postgres', 'Edge Functions'], '基于火山引擎 Supabase 工作区：执行 SQL、管理迁移、部署 Edge Functions。', ['list_tables', 'execute_sql', 'apply_migration', 'get_workspace_url', 'deploy_edge_function']],
  ['dbw', '数据库工作台 DBW', 'DBW', 'database', ['SQL 执行', '慢查询', '诊断'], '在数据库工作台中执行 SQL、查看慢查询与会话，做实例诊断。', ['execute_sql', 'describe_slow_logs', 'describe_sessions']],
  ['dts', '数据库传输服务 DTS', 'DTS', 'data', ['迁移', '同步', '订阅'], '查询数据迁移、同步与订阅任务的状态和进度。', ['describe_tasks', 'describe_task_progress']],
  /* 中间件与容器 */
  ['vefaas_function', '函数服务 veFaaS', 'FaaS', 'cloud', ['Serverless', '函数', '触发器'], '管理函数与触发器的完整生命周期：创建、发布、查看日志。', ['create_function', 'release_function', 'list_triggers', 'get_function_logs']],
  ['vke', '容器服务 VKE', 'VKE', 'cloud', ['Kubernetes', '集群', '节点池'], '自然语言管理容器服务集群、节点池与工作负载。', ['list_clusters', 'list_node_pools', 'list_nodes']],
  ['cr', '镜像仓库 CR', 'CR', 'cloud', ['容器镜像', '命名空间'], '查询镜像仓库实例、命名空间、仓库与镜像版本。', ['list_registries', 'list_repositories', 'list_tags']],
  ['cp', '持续交付 CP', 'CP', 'devtools', ['CI/CD', '流水线'], '用自然语言排查流水线执行问题：查询工作区、流水线与运行记录。', ['list_workspaces', 'list_pipelines', 'get_pipeline_run']],
  ['veapig', 'API 网关', 'APIG', 'cloud', ['网关', '路由', '服务'], '查询云原生 API 网关实例、服务与路由配置。', ['list_gateways', 'list_gateway_services', 'list_routes']],
  ['nacos', '微服务引擎 Nacos', 'Nacos', 'cloud', ['注册中心', '配置中心'], '查询 Nacos 注册中心的服务实例与配置项。', ['list_services', 'list_configs', 'get_config']],
  ['rabbitmq', '消息队列 RabbitMQ', 'RMQ', 'cloud', ['消息队列', '实例'], '查询 RabbitMQ 实例、虚拟主机、队列与连接信息。', ['describe_instances', 'describe_vhosts']],
  ['rocketmq', '消息队列 RocketMQ', 'Rocket', 'cloud', ['消息队列', 'Topic', 'Group'], '查询 RocketMQ 实例、Topic、消费组与消息堆积。', ['describe_instances', 'describe_topics', 'describe_groups']],
  /* 可观测 */
  ['vmp', '托管 Prometheus VMP', 'VMP', 'cloud', ['Prometheus', '指标查询'], '自然语言查询分析 Prometheus 指标数据，自动生成 PromQL。', ['query_metrics', 'list_workspaces']],
  ['apmplus', '应用性能监控 APMPlus', 'APM', 'cloud', ['链路追踪', '运行时指标'], '查询应用服务的链路追踪与运行时指标，定位慢请求和异常。', ['query_traces', 'query_metrics']],
  ['cloudmonitor', '云监控', '监控', 'cloud', ['监控指标', '告警'], '查询云产品监控指标、告警规则与告警历史。', ['get_metric_data', 'list_alert_rules', 'list_alert_events']],
  ['metrics', '指标服务 Metrics', '指标', 'cloud', ['指标', '可视化'], '自然语言查询与管理火山引擎指标数据。', ['query_metrics', 'list_metrics']],
  /* CDN、边缘与网络 */
  ['cdn', 'CDN', 'CDN', 'cloud', ['加速', '刷新预热', '用量分析'], '火山引擎 CDN 智能分析助手：域名配置、刷新预热、流量与状态码分析。', ['list_cdn_domains', 'submit_refresh_task', 'describe_cdn_data']],
  ['dcdn', '全站加速 DCDN', 'DCDN', 'cloud', ['动静态加速'], '查询全站加速域名配置与访问数据。', ['list_domains', 'describe_statistics']],
  ['mcdn', '多云 CDN', 'MCDN', 'cloud', ['多云调度'], '统一查看多家 CDN 厂商的域名、调度与用量。', ['list_cdn_domains', 'describe_stats']],
  ['veen', '边缘计算节点', '边缘', 'cloud', ['边缘', '虚拟机', '裸金属'], '申请、配置、查阅边缘计算节点的虚拟机、镜像、裸金属及网络配置。', ['list_instances', 'create_instance', 'list_images']],
  ['alb', '应用型负载均衡 ALB', 'ALB', 'cloud', ['负载均衡', '监听器', '证书'], '查阅 ALB 实例及其监听器、后端服务器组与证书信息。', ['describe_load_balancers', 'describe_listeners', 'describe_server_groups']],
  ['iga', '智能全球加速 IGA', 'IGA', 'cloud', ['全站加速', '域名配置'], '基于自然语言查询分析加速业务数据与域名配置。', ['ListDomainConfig', 'DescribeDomainDetail', 'DescribeStatistics']],
  ['ga', '全球加速 GA', 'GA', 'cloud', ['跨地域', '加速'], '查询全球加速实例、监听器与终端节点组。', ['list_accelerators', 'list_listeners']],
  ['vpc', '私有网络 VPC', 'VPC', 'cloud', ['网络', '子网', '安全组'], '查询 VPC、子网、路由表与安全组规则。', ['describe_vpcs', 'describe_subnets', 'describe_security_groups']],
  ['vpn', 'VPN 连接', 'VPN', 'cloud', ['网络', 'IPsec'], '查询 VPN 网关、用户网关与 IPsec 连接状态。', ['describe_vpn_gateways', 'describe_vpn_connections']],
  ['eip', '公网 IP', 'EIP', 'cloud', ['网络', '带宽'], '查询与管理弹性公网 IP 及其绑定关系、带宽。', ['describe_eip_addresses', 'associate_eip']],
  ['cen', '云企业网 CEN', 'CEN', 'cloud', ['跨地域互通'], '查询云企业网实例、网络实例连接与带宽包。', ['describe_cens', 'describe_cen_attached_instances']],
  ['transitrouter', '中转路由器', 'TR', 'cloud', ['网络', '路由'], '查询中转路由器实例、连接与路由表。', ['describe_transit_routers', 'describe_route_tables']],
  ['na', '云网络智能中心', 'NA', 'cloud', ['网络诊断'], '创建云网络实例诊断并查询诊断结果。', ['create_diagnosis', 'describe_diagnosis_result']],
  ['vortexip', 'VortexIP', 'VIP', 'cloud', ['网络', '出口 IP'], '基于自然语言查询 VortexIP 与 WebScraper 实例信息。', ['describe_instances', 'describe_webscraper_instances']],
  ['traffic_route', '云解析 TrafficRoute', 'DNS', 'cloud', ['DNS', '智能解析'], '管理各类 DNS 节点的线路与解析配置。', ['list_zones', 'list_records', 'create_record']],
  ['domain_service', '域名服务', '域名', 'cloud', ['域名注册', '查询'], '通过自然语言查询域名可注册状态并注册域名。', ['check_domain', 'register_domain']],
  /* 大数据 */
  ['las', '湖仓一体分析 LAS', 'LAS', 'data', ['多模态数据集', '数据清洗'], '提供多模态数据集管理与清洗能力。', ['list_datasets', 'create_clean_task']],
  ['bytehouse', 'ByteHouse', 'BH', 'data', ['云数仓', 'SQL', '查询优化'], 'ByteHouse 云数仓：生成并执行 SQL、分析查询瓶颈并给出优化建议。', ['run_select_query', 'list_tables', 'analyze_query']],
  ['emr', 'E-MapReduce', 'EMR', 'data', ['Hadoop', 'Spark', '集群'], '查询 EMR 集群、节点组与作业运行状态。', ['list_clusters', 'list_node_groups', 'list_jobs']],
  ['flink', '流式计算 Flink', 'Flink', 'data', ['实时计算', '作业'], '查询 Flink 项目、作业与运行实例状态。', ['list_projects', 'list_jobs', 'get_job_instance']],
  /* 视频云与 AI 中台 */
  ['live', '视频直播', '直播', 'design', ['直播', '数据查询'], '通过自然语言高效查询视频直播的域名、流与用量数据。', ['list_domains', 'describe_live_stream', 'describe_bandwidth_data']],
  ['vod', '视频点播 VOD', 'VOD', 'design', ['智能剪辑', '媒资'], '火山引擎 VOD 智能剪辑助手：媒资检索、剪辑拼接、字幕与转码。', ['search_media', 'submit_edit_task', 'get_play_info']],
  ['veimagex', '图片服务 veImageX', 'IMX', 'design', ['图片处理', '智能图片'], 'veImageX 智能图片助理：上传、处理、压缩与画质增强。', ['upload_image', 'process_image', 'get_image_info']],
  ['mediakit', 'AI MediaKit', 'MK', 'design', ['音视频剪辑', '画质增强'], '覆盖从任务查询到深度剪辑与视频增强的全流程音视频处理。', ['video_trim', 'audio_extract', 'video_enhance', 'query_task']],
  ['rtc', '实时音视频 RTC 对话式 AI', 'RTC', 'ai', ['语音对话', '智能体'], '启动、更新、停止实时语音对话智能体任务。', ['start_voice_chat', 'update_voice_chat', 'stop_voice_chat']],
  /* 自动化 */
  ['mobile_use', '云手机 Mobile Use', '手机', 'browser', ['云手机', 'App 自动化'], '面向 Agent 自动化执行云手机任务：截图、点击、输入、启动应用。', ['take_screenshot', 'tap', 'swipe', 'text_input', 'launch_app']],
  ['computer_use', 'Computer Use', 'CU', 'browser', ['桌面自动化', '云服务器'], '自然语言驱动操作云服务器实例里的桌面应用：鼠标、键盘与截图。', ['move_mouse', 'click_mouse', 'type_text', 'press_key', 'take_screenshot']],
  ['vefaas_browser', 'veFaaS Browser', '浏览', 'browser', ['浏览器', '截图', 'PDF'], '在函数服务里运行浏览器，提供页面、元素、键盘、表单、标签页、截图与 PDF 等原子操作。', ['create_browser_task', 'navigate', 'click', 'screenshot', 'pdf']],
  ['vefaas_browser_use', 'Browser-Use', 'BU', 'browser', ['Browser-use', '网页任务'], '基于 Browser-use 的浏览器工具，用一句话描述完成网页任务。', ['run_browser_task', 'get_task_result']],
  ['vefaas_sandbox', 'Code Sandbox', '沙箱', 'devtools', ['代码执行', '隔离'], '面向大模型的代码沙箱，安全执行 Python / Node 代码。', ['run_code', 'upload_file']],
  ['ccapi', 'Cloud Control API', 'CCAPI', 'devtools', ['资源管理', '统一 API'], '基于 Cloud Control API 统一管理各类火山引擎资源。', ['list_resources', 'get_resource', 'create_resource', 'update_resource']],
  /* 搜索与 AI */
  ['aisearch', 'AI 搜索引擎', 'AIS', 'search', ['多模态检索', '企业搜索'], '基于大模型的多模态语义理解，结合字节跳动检索实践，开箱即用的 AI 搜索。', ['search 按应用与数据集检索']],
  ['askecho', '联网问答 Agent', '问答', 'search', ['联网搜索', '问答'], '基于联网搜索结果，提供端到端的 AI 问答能力。', ['chat_completion 联网问答']],
  ['askecho_search_infinity', 'SearchInfinity 联网搜索', 'SI', 'search', ['联网搜索', '知识获取'], '为大模型提供联网搜索能力，提升回答的时效与准确性。', ['web_search']],
  ['vortexip_webscraper', 'Web Scraper', '抓取', 'search', ['SERP', '实时检索'], '面向 AI 的实时搜索引擎结果抓取（当前仅柔佛地域提供）。', ['webscraper_serp']],
  ['ark', '方舟零代码 Bot', '方舟', 'ai', ['火山方舟', '智能体'], '把火山方舟上的零代码应用接成工具：对话、联网搜索、链接读取、计算。', ['bot_chat', 'web_search', 'link_reader', 'caculator'], [secret('ARK_API_KEY', '方舟 API Key'), field('ARK_BOT_ID', '应用 ID')]],
  ['knowledgebase', 'Viking 知识库', '知识', 'ai', ['知识库', 'RAG'], '管理知识库集合与文档，检索相关知识片段。', ['add_document_by_url', 'list_documents', 'search_knowledge']],
  ['vikingdb', '向量数据库 VikingDB', 'VDB', 'ai', ['向量检索', '索引'], '向 VikingDB 写入向量数据并做相似检索。', ['upsert_data', 'search_by_text', 'fetch_data'], [field('VIKING_DB_COLLECTION_NAME', 'Collection'), field('VIKING_DB_INDEX_NAME', '索引名')]],
  ['vikingdb_memory', 'Viking 记忆库', '记忆', 'ai', ['长期记忆', '检索'], '向 Viking 记忆库写入并检索记忆，作为 Agent 的长期记忆。', ['add_memory', 'search_memory']],
  ['hiagent_knowledge', 'HiAgent 知识引擎', 'HiA', 'ai', ['知识引擎', 'Wiki'], '把 HiAgent 知识引擎暴露为工具：跨数据集检索、正则匹配、读取文档与 Wiki 页面。', ['search_knowledge', 'grep_knowledge_chunks', 'list_document_chunks', 'search_wiki']],
  ['openviking_controlplane', 'OpenViking 控制面', 'OV', 'ai', ['知识库管理', 'CLI'], '管理 OpenViking 知识库集合的生命周期、计费、用户与数据空间。', ['list_collections', 'create_collection', 'get_collection', 'update_collection']],
  /* 安全与治理 */
  ['sec_agent', '安全智能体', '安全', 'security', ['安全运营', '告警研判'], 'AI 驱动的安全运营代理，整合火山安全自有工具与第三方生态做告警研判和处置。', ['query_alarms', 'analyze_alarm', 'query_assets']],
  ['iam', '访问控制 IAM', 'IAM', 'security', ['用户', '策略', '角色'], '自然语言管理火山引擎用户、用户组、角色与权限策略。', ['list_users', 'list_policies', 'attach_user_policy']],
  ['sts', '安全凭证服务 STS', 'STS', 'security', ['临时凭证', '角色扮演'], '申请临时安全凭证（AssumeRole），用于最小权限访问。', ['assume_role']],
  ['cloudidentity', '云身份中心', 'CI', 'security', ['单点登录', '多账号'], '管理云身份中心的用户、用户组与多账号权限分配。', ['list_users', 'list_groups', 'list_permission_sets']],
  ['cloud_trail', '云审计 CloudTrail', '审计', 'security', ['操作审计', '合规'], '查询账号下的资源操作记录，审计谁在何时做了什么。', ['lookup_events', 'describe_trails']],
  ['certificate_center', '证书中心', '证书', 'security', ['SSL 证书', '到期提醒'], '自然语言管理 SSL 证书：查询、申请、到期提醒与部署。', ['list_certificates', 'describe_certificate']],
  ['billing', '费用中心', '费用', 'finance', ['账单', '余额', '成本'], '自然语言查询账户余额、账单明细与费用趋势。', ['query_balance', 'list_bills', 'list_bill_details']],
  ['resource_share', '资源共享', '共享', 'cloud', ['跨账号', '资源共享'], '跨账号共享资源：查询共享单元与共享关系。', ['list_resource_shares', 'list_shared_resources']],
  ['project', '项目管理', '项目', 'cloud', ['资源分组', '项目'], '管理云项目与项目下的资源归属。', ['list_projects', 'move_resources_to_project']],
  ['organization', '企业组织', '组织', 'cloud', ['多账号', '组织架构'], '查询企业组织的账号、组织单元与管控策略。', ['list_accounts', 'list_organizational_units']],
  ['tag', '标签服务', '标签', 'cloud', ['资源标签'], '按标签检索资源，批量打标签与解绑。', ['get_resources_by_tag', 'tag_resources', 'untag_resources']],
  ['resourcecenter', '资源中心', '资源', 'cloud', ['全局资源', '检索'], '跨地域、跨产品统一检索账号下的云资源。', ['search_resources', 'get_resource_counts']],
  /* 其他 */
  ['sms', '短信服务 SMS', '短信', 'office', ['短信', '模板', '群发'], '独立调用短信资质、签名、模板、发送、群发与结果查询接口，无状态部署。', ['send_sms', 'list_templates', 'list_signatures', 'query_send_result']],
  ['enterprise', '企业服务 · 商标查询', '商标', 'other', ['商标', '企业信息'], '通过自然语言查询商标注册信息、申请人与注册要求。', ['search_trademark']],
  ['iot', '物联网平台 IoT', 'IoT', 'other', ['设备', '物模型', '属性'], '查询物联网实例、产品、物模型与设备属性上报数据。', ['get_instance_list', 'get_product_detail', 'get_thing_model', 'get_last_device_property_value']],
]

const pkg = (dir: string) => `mcp-server-${dir.replace(/_/g, '-')}`
/** README 中「火山引擎大模型生态广场」常用服务，排序靠前 */
const hot = ['ecs', 'tos', 'rds_mysql', 'vikingdb', 'ark', 'computer_use', 'mobile_use', 'vefaas_browser', 'cdn', 'billing', 'knowledgebase', 'tls', 'vke', 'askecho_search_infinity', 'redis']

export const volcConnectors: ConnectorDef[] = rows.map(([dir, name, mono, category, tags, description, capabilities, extra = []], i) => {
  const rank = hot.indexOf(dir)
  return {
    id: `volc-${dir.replace(/_/g, '-')}`,
    name,
    brand: 'volcengine',
    color: '#1664ff',
    mono,
    publisher: 'volcengine',
    repo_url: gh(`volcengine/mcp-server/tree/main/server/mcp_server_${dir}`),
    category,
    tags,
    description,
    capabilities,
    local: { command: 'uvx', args: ['--from', `git+https://github.com/volcengine/mcp-server#subdirectory=server/mcp_server_${dir}`, pkg(dir)] },
    auth: 'env',
    fields: [...AKSK, ...extra],
    featured: rank >= 0 && rank < 4,
    popularity: rank >= 0 ? 6800 - rank * 260 : 2600 - i * 23,
  }
})
