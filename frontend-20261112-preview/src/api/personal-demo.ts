/** Personal assistant demo only: never writes Agent configuration. */
import { kbDb } from './mock/knowledge'
import { db } from './mock/skills'
export const listDemoKnowledgeBases = async () => kbDb.libraries().map(l => ({ ...l, name: l.baseName, count: Number(l.documentCount) || 0, ownedByMe: true }))
export const listDemoNativeSkills = async () => db.listNative()
export const listDemoLocalSkills = async () => db.listLocal()
