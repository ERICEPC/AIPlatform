export type RunnerMode = 'preview' | 'published'

export function teamRunUrl(teamId: string, mode: RunnerMode, workspaceId?: string, runId?: string) {
  const query = new URLSearchParams({ mode })
  if (workspaceId) query.set('workspace', workspaceId)
  if (runId) query.set('run', runId)
  return `/agent-teams/${encodeURIComponent(teamId)}/run?${query}`
}
