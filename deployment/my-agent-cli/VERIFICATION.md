# Verification — 2026-11-11

Deployed `/console/api/agent-cli` to server 10.151.113.125, normal account session + CSRF authenticated. Scope is current workspace, current owner, active roster, excluding enterprise/system. Existing personal CLI business service handles draft editing and governance publishing; no approval bypass or new roles.

Passed in production environment:
- unauthenticated requests rejected (401), enterprise target excluded (404), injected create fields rejected (400).
- create draft, repeated same-name create returns existing draft; cannot create API key before publication (409).
- stale revision rejected (409), valid update accepted.
- private publish with external access approved under existing policy.
- app API key issued, real `/v1/chat-messages` streaming request completed with message_end, key revoked.
- temporary test app deleted after each test; final own non-enterprise agent list empty.
- actual standalone Python CLI over pinned HTTPS: whoami, list, workspaces.
- seven local tests: secret file permissions/no overwrite, certificate mismatch before sending credentials, plaintext URL rejection, redirect rejection, existing key output blocks creation, streaming aggregation, streaming error/truncation detection.

A colleague's password login was not exercised (no colleague credentials provided). Login reuses existing platform email/password + cookie/CSRF endpoint; no password persistence. Membership and workspace role remain required. Shared/public approval flow reuses existing service and was not newly approved during tests.

Code: `installer/runtime/build/api/code/controllers/console/agent/my_agent_cli.py` and agent route init.
Remote deployment backup: `/home/user/services/raccoonx-redeploy-20261106/deployment/my-agent-cli-20261111/` (original init, compose). New module bind mounts persisted for API/websocket/workers; API reloaded. Existing modified source files were not replaced wholesale.

Earlier cleanup: archived precisely 17 own non-enterprise active roster Agents and disabled their Web/API flags, with original state saved server-side at `/app/api/storage/admin-backups/clear-my-agents-20261111.json`. Other Agent statuses unchanged.
