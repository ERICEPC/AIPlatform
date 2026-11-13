# Raccoon X personal assistant — DeepSeek Harness

Official runtime: `@deepseek-ai/dsh-sdk-client@0.2.2-rc.1` (MIT), SDK profile. This is independent of Dify Agent Soul configuration.

## Implemented

- Authenticated account + workspace scoped configuration in PostgreSQL, optimistic revision checking, separate saved/applied revisions.
- Model catalog and server-side credentials reuse existing platform model provider configuration. Current adapter supports OpenAI-compatible providers; unsupported provider protocols are disabled.
- Skills catalog reuses published platform Skill versions, downloads actual archives and materializes scripts/resources, checks archive traversal/size, and verifies registration before marking applied.
- MCP connector settings and credentials are resolved server-side. Application fails if a selected connector does not register tools.
- Platform Agent / dataset selection uses existing tenant records. A short-lived HMAC-scoped MCP bridge rechecks selected resources and access before invoking published apps or dataset retrieval. Empty dataset catalogs remain empty; no demo documents are injected.
- Account-private manually maintained memory is included only when enabled.
- Real SDK conversation execution and session continuation. Sessions belong to the account and configuration revision. Changing configuration requires a new conversation.
- Worker containers have account-specific named volumes, unprivileged UID, read-only image, capability dropping, CPU/memory limits and no Docker socket. The trusted internal broker holds the Docker socket; it has no public port, and accepts requests only with the server-side service token. Runtime jobs never receive that token.
- Commands are opt-in. Additional approval requests fail closed. Plugin installation and native schedules are disabled.

## Not implemented / not verified

- Scheduled jobs, team delegation initiation and shared memory are not enabled. No UI claims that these are active.
- Personal memory is manually maintained, not automatic memory extraction.
- Knowledge retrieval bridge requires a real dataset. The deployed test workspace has none, so retrieval quality has not been verified.
- Agent bridge registration and permission checks are implemented; end-to-end execution of every enterprise Agent is not an acceptance claim.
- Project file upload/download and historical conversation browsing are not yet exposed in this personal assistant UI. Session data persists in the account volume, but the UI currently starts a new conversation after a reload.
- API requests wait for complete replies; there is no streaming event UI yet.
- Existing native skill placeholders are not implicitly installed by this integration. Only actually published skills appear in the picker.

## Validation (2026-11-06)

- TypeScript + Vite production build passed (`VITE_BASE=/new-ui/`).
- Compiler tests: provider routing / secret handling, memory toggle, unsafe archive paths, MCP namespaces: 4 passed.
- Authenticated browser: configuration loaded, selected DeepSeek-V4.1-Flash, saved v1, applied v1, returned to chat and received `个人助手连接成功` from the real runtime.
- Isolated Linux worker executed real gateway chat successfully. Native addon loading requires executable tmpfs: `/tmp:rw,nosuid,exec,size=256m`.
- Existing four published Skills registered: sn-image-base, sn-image-doctor, sn-prepare-citations, sn-update.
- Existing SenseAudio connector registered four MCP tools.
- Unauthenticated config request returned 401; unsigned platform bridge request returned 403.

## Deployment

`Dockerfile` builds the worker and internal broker. `prepare_deploy.py` takes a compose backup and adds the broker plus authenticated API environment and source mounts. Run `schema.sql` before restarting the API. No existing business tables are deleted.

Live URL: https://10.151.113.125:21190/#config

Host project: `/home/user/services/raccoonx-redeploy-20261106`
Compose project: `raccoon_2e550c84c5`
Rollback backup: `deployment/backups/harness-20261106-190711/` (compose + previous frontend assets). Restoring compose and running `up -d --no-deps api` removes the personal API mounts; remove the broker separately. New configuration/session tables and private worker volumes should be retained for recovery.

## Collaboration integration (2026-11-06)

The collaboration controller now invokes this broker with a server-owned projectKey. Project jobs receive separate volumes and no personal memory. Cross-account invocation requires the saved and applied collaborationEnabled grant; private resource bindings are not inherited. See ../collaboration/README.md for live UI behavior, acceptance tests and current limits.
