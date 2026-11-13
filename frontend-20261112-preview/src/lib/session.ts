import { useSyncExternalStore } from 'react'
import type { Permissions } from '@/api/access'
let state:{perms:Permissions|null}={perms:null}
const listeners=new Set<()=>void>()
export function setPermissions(perms:Permissions|null){state={perms};listeners.forEach(l=>l())}
export function useSession(){return useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l)}},()=>state)}
