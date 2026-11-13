# 未冻结季度 KR 的来源限定推荐合同

`pb.recommendation.v1 / recommendation.generate` 独立于正式 `pb.okr.v1`。适用于 PB 当前 `recommendation-okr-evidence-v1`，季度可为 draft，月周可为空。结果只是负责人可编辑的任务建议，不冻结季度、不创建月周计划、不下发任务。

固定 PB 代码基线 `4cbe7d58`；输出 Schema 从实际运行 PB 的 `AgentSuggestions.model_json_schema()` 导出，逐字节保存在 `installer/runtime/build/api/code/vendor/pb-recommendation-v1/`，与 request Schema、原推荐 instructions 一起由 manifest 固定。不是调用方自选 outputSchema。

## 请求及接口

```text
POST /v1/recommendations/applications/{application_id}/runs
GET  /v1/recommendations/applications/{application_id}/runs/by-intent/{intent_id}
GET  /v1/recommendations/applications/{application_id}/runs/{run_id}
POST /v1/recommendations/applications/{application_id}/runs/{run_id}/cancel
Authorization: Bearer rx_rec_...
```

请求字段：`schema_version`、`task_kind`、`intent_id`、`scope`、`application`、`input_snapshot_hash`、`source_json`。完整合法样例见 `tests/recommendation/example.json`；Schema 位于 vendor 目录。

- scope 固定 tenant/team/actor，来自服务端 principal；application 固定 workspace/application/published snapshot，必须绑定本合同 manifest。
- `source_json` 是 PB `GenerationRun.input_snapshot` 的规范 JSON 字符串：`json.dumps(source, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)`。
- `input_snapshot_hash` 为该字符串 UTF-8 字节的 SHA256，与现有 PB `daily_review.integrity.digest(source)` 相同。字符串外壳保留原有数值与日期语义，避免运行信封 rx-json-v1 的整数限制错误改写工时或来源。来源最多48000字符，外层请求仍限制256KiB。
- 本操作只支持已有 `recommendation-okr-evidence-v1`，不接收调用方 instructions、outputSchema、工具、模型、URL配置或 `parent_confirmed`。确认周来源继续走已有正式计划路径。
- source 中的 tenant/team、当前项目、成员候选、选定KR与准确 evidence ref 必须自洽；KR可为draft/active。来源文本视为不可信数据。

## 输出、执行与权限

`model_output` 原样返回 PB `AgentSuggestions`：`items` 数组及非空 `notes`。每项保留 title/reason/deliverable/due_date/plan_hours/assignee_id/evidence_refs。`plan_hours` 是0.25至24、四分之一小时增量的JSON数值，仅建议；容量未知不构成正式承诺。无需下一步或证据不足可返回 `items=[]`，在notes解释，不产生正式业务对象。

服务端校验成员必须来自输入候选、日期不得早于plan_date、所有引用来自本次evidence、每项必须引用所选KR、不能重复已有任务/推荐或同批候选。引用合法不等于文本事实已被外部核实，PB仍须人工复核。

复用 NativeExecutor 的快照绑定和受控执行边界，强制 `include_shell=False`、关闭config层/工具/知识库/人工工具/历史；不能靠“可见工具为空”推断来源限定。模型和prompt由已发布服务端快照提供。

使用独立的 `rx_rec_*`，OKR端点拒绝该前缀，推荐端点拒绝 `rx_okr_*`；二者都不是普通Agent的 `app-*`。principal、workspace、application、scope均经服务端核验。新应用/快照绑定及凭据须显式开通；本仓不包含实例身份或Key。

运行回执返回 schema_version/task_kind/intent/输入hash/scope/application/run_id/state 和未知用量清单；`runtime`返回error、取消标记、时间及manifest。模型不得生成这些字段。

沿用原运行表，无Schema迁移。幂等范围workspace/principal/application/intent，改变完整请求409；保留30天，过期410；状态与取消、按意图查询语义同OKR。首次受理不明只查原intent，禁止自动再POST或自动换供应商。`attempts_complete=false` 不解释为零用量。

## PB 最小适配差异

1. 保留现有推荐来源、权限、不可变快照、人工编辑/下发及SenseAudio直连；仅为 `pb.recommendation.generate.v1` 增加运行绑定/传输适配。
2. 从现有 `ProviderRequest.input` 中读取 `source`，验证 `outputSchema` 与固定AgentSuggestions一致，规范化source生成上述请求。intent使用持久PB生成Job ID，不能每次重试换UUID。
3. 复用OKR运行队列/HTTP客户端的受理、查询和未知结果处理思路；新增schema_version和items/notes校验，不能直接用正式plan输出模型解析推荐。
4. POST仅一次，得到服务端run_id后保存；失败不明先GET原intent。终态成功才把 `model_output` 交给现有RecommendationHandler验证和保存；确认下发事务仍复核原身份、来源版本、项目、成员与日期。
5. 推荐专用catalog/Key单独挂载，不把Key写入全局raccoon普通Agent配置。`rx_rec_*`不满足既有RaccoonProvider的app-*校验，应使用本专用异步协议。

离线测试：`python -m pytest -q tests/recommendation tests/cli_approval`。离线样例与真实模型/网页验收分别记录。

The recommendation route authenticates with its scoped `rx_rec_` Bearer key. If the
site enables browser Basic authentication, keep `auth_basic off` inside this exact
API location. Readiness must verify the runtime's JSON error body and a valid-key
request; an HTTP 401 HTML login challenge alone does not prove API routing.

## 重复工作质量策略 V2

发布新的、独立的应用/快照时，可在固定基础 instructions 与输出 Schema 后追加
`docs/policies/recommendation-no-duplicate-v2.txt`。策略要求比较已有任务的目标、
交付和验收范围；进行中、待核对和退回任务的完成、提交、日报或补交继续原任务，
没有来源明确支持的独立新增交付时返回 `items=[]` 并解释继续原任务。

这是服务端已发布快照的补充质量策略，不是调用方字段，也不是确定性语义去重
校验器。协议、Schema 和 manifest 保持兼容；新快照使用独立绑定与 catalog，
交付后由接入方选择切换，不能原地覆盖正在使用的配置。保留原始失败运行和输出，
使用原输入以及明确标记的状态变体做模型回归，并保留独立新增工作应能产生建议的
正例。样本通过不代表推荐内容质量已全面验收。

后续待发布的状态措辞补充见
`docs/policies/recommendation-status-wording-v3.txt`：明确区分 `done`、
`pending_verification` 和 `returned`，按任务当前状态逐项描述，避免把历史成果提交
误写成当前仍待核对。该文件是候选策略，尚未追加到线上 V2 快照；发布前须分别用
完成、待核对、退回和混合状态样例验证，保留原始输出。
