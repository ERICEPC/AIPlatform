# ProjectBuddy OKR 联调合同 v1

版本 pb.okr.v1，交付修订 2026-10-28.no-action（见 manifest）；状态为 PB 侧可执行联调合同，待与所选中台运行入口映射。此目录没有凭据，不代表 Raccoon X 已支持同名字段或已完成真实联调。

## 文件与用途

- request.schema.json：PB 冻结请求，绑定用途、稳定意图、身份范围、应用快照、输入哈希。
- model-output.schema.json：模型只输出待审核草稿、具体 missing_inputs，或 task.suggest 的 no_action。
- runtime-receipt.schema.json：由中台服务端/可信传输返回的原运行、版本、状态和尝试/用量，不由模型生成。
- examples/：8 个合成案例，覆盖月计划、周计划、日任务、复盘、缺容量、无需新增任务、首次响应丢失、权限撤销。
- manifest.json：上述生成文件的 SHA256；README 不属于生成清单。

可在项目已有后端运行环境执行：
```sh
python app/scripts/export-okr-platform-contract.py
```
默认只验证固定路径内容与8例结果；--write 才重新生成。不会连接中台、读服务凭据、写业务库或启动模型。后端公开校验入口在 buddy.modules.planning.platform_contract。

## 请求与哈希

每请求仅一个 KR 和一个目标时段：plan.decompose 支持季度→月、月→周；task.suggest 支持周→指定日，可返回多个候选；progress.review 支持月/周复盘。此粒度与当前每 KR/级别/时段一个月周目标相符。多 KR/多周期需分别形成意图，不把同一目标创建多份。

PB 必须先检查当前身份、读取范围、已确认父版本及请求时段，再构建 Snapshot。sources 是当前可读对象的准确引用和必要摘要；members/project 候选及 available_minutes 是经业务确认的范围/剩余容量。source content_hash 是正式来源修订的哈希，摘要不代替原始修订；本次传送的摘要也参与输入哈希。parent_confirmed 必须是真正的布尔 true，真实草稿不能用合成版本代替。

规范 PB-JSON-v1：

1. 按封闭 Schema 验证；数值仅整数，不接受 float、数字字符串、NaN、Infinity，拒绝重复 JSON 键。字段名为 Schema 的 ASCII 名称。
2. 取 schema_version、task_kind、scope、application、input 五个顶层字段。intent_id 和 input_snapshot_hash 自身不入输入哈希；同一稳定意图另绑定完整原请求。
3. 对象字段递归按键排序，数组顺序保持，UTF-8 编码，无 BOM/空白分隔符，非 ASCII 字符直接编码，不作 Unicode 归一化，SHA-256 小写 hex。这不是 RFC8785。
4. Python 精确配置：json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')。
5. 请求上限256 KiB，是本地合同边界，不是中台上下文或性能承诺。原请求以不可变 bytes 交给持久意图存储；本库不实现数据库或持久运行队列。

同意图改变输入、任务类型、身份、应用或快照会被比较器拒绝。相同请求比较通过也不授权重发；平台幂等作用域/保留期尚未实测。

## 草稿及引用校验

plan 输出一个目标候选，task 输出候选数组；candidate_id 仅草稿内标识。正式 ID、版本、回执由 PB 确认事务生成。任务候选明确项目、负责人、独立核对人、工作日、截止日和15分钟粒度工时；总工时不得超过该成员本次已知剩余容量。没有容量、负责人或核对信息时返回 missing_inputs。

task.suggest 还有显式的 result_kind=no_action：给出原 parent_ref、非空 reason、包含该父计划的精确 source_refs 和 warnings，不带 candidates/负责人/工时等分派字段。它表示模型未找到有依据的新任务，检查后返回 no_action_needs_review，仍需人工复核；不自动确认全部工作、项目或 KR 已完成。容量未知不妨碍这一无分派结果，但若有工作而缺少容量等条件，应返回 missing_inputs，不用 no_action 隐藏信息缺口。空 draft.candidates 继续拒绝，不能静默解释成已完成。

此次新增一个输出分支；request/runtime-receipt Schema 及原七例保持不变。pb.okr.v1 是双方尚待映射的 PB 业务合同，不能宣称旧中台应用已兼容新分支。中台发布/联调时应固定本次 manifest 和 model-output Schema 哈希，明确支持 no_action 后再验收；运行成功不等于可以应用业务结果。

模型不得提供 run_id、服务身份、发布快照、计量或正式完成状态。引用必须来自冻结输入，kind/id/version/hash全部一致。父版本、成员范围、约束或来源摘要变化时，旧结果会被拒绝；仅靠引用存在不能证明文本陈述正确，所有有效草稿仍需人工核对语义。缺证据与明确差距分别表达，任务完成不等于KR业务值。

check_result 的 authorized 和 current_snapshot 必须由服务端重新取证，不接受前端或模型自报。此函数没有权限数据库；在真实产品接入时，确认事务仍需重新检查角色、原身份、父版本、D15时间窗与租约。当前合同代码没有创建/确认业务对象的接口，不可把本地通过称为正式计划已应用。

## 运行状态与恢复

可信 RuntimeReceipt 必须匹配原 run_id、intent、输入哈希、身份和应用发布版本。state=succeeded 只表示运行成功，业务可能仍是 missing_inputs。attempts_complete 描述尝试清单覆盖度；每次用量为 complete/partial/unknown，未知计数保留 null，不能填0。尚无运行计量合同的字段不能由适配器或模型伪造。

本地恢复决策只有四种：
- 尚无可信受理回执：manual_reconcile_unknown，不能推出未执行。
- 已有原运行且queued/running：inspect_original_run。
- 已有原运行且succeeded：validate_result。
- 可信运行终态failed/timed_out/cancelled/interrupted：record_terminal_failure。

没有提交/重试分支。取消请求受理、HTTP403、断线都不是已取消或未执行的证明。现有 Teams 的同请求幂等取回能力需另验作用域/保留期；本包不假装已验证该协议。

## 样本边界

所有 examples 都是人工构造的合成合同，应用/空间/成员/来源 ID 不对应线上对象。lost-response 是“没有受理回执时保留未知”的本地行为，不是已在中台制造断线并找回原运行；permission-denied 是 PB 校验边界，不是线上异空间拒绝证明。真实季度准备状态另见项目验收记录。

本次没有定义中台尚未确认的 HTTP 路径或选定 Agent/Workflow/Team。接入需取得具体合同并映射，普通 Agent 不继承 Teams 的保证。
