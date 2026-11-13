import { writeFile } from 'node:fs/promises'
export const name = 'raccoon-runtime-inspector'
export const inject = ['tools', 'skills']
export function apply(ctx, config) {
  let writing = false
  const timer = setInterval(async () => {
    if (writing) return
    writing = true
    try {
      const tools = ctx.tools.definitions().map(tool => tool.name)
      const skills = (await ctx.skills.list()).map(skill => skill.name)
      await writeFile(config.path, JSON.stringify({ tools, skills }))
    } catch {} finally { writing = false }
  }, 200)
  ctx.on('dispose', () => clearInterval(timer))
}
