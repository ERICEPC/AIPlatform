import { DevelopmentCatalog } from './development-catalog'
export function ScaffoldPage({go}:{go:(p:string)=>void}) { return <DevelopmentCatalog kind="template" go={go} /> }
