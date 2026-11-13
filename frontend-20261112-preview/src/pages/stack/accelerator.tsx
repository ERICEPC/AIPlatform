import { DevelopmentCatalog } from './development-catalog'
export function AcceleratorPage({go}:{go:(p:string)=>void}) { return <DevelopmentCatalog kind="module" go={go} /> }
